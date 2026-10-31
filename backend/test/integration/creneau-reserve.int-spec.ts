import { CartStatus, SlotStatus } from '@prisma/client';
import { CartService } from '../../src/modules/cart/cart.service';
import { SlotsService } from '../../src/modules/slots/slots.service';
import { monterServices, unique, creerOrganisationComplete } from './banc';

/**
 * LE CRÉNEAU CHOISI NE DOIT PAS DISPARAÎTRE APRÈS LE PAIEMENT.
 *
 * La place d'un créneau était prise au moment de CRÉER la commande, donc
 * APRÈS l'encaissement. Un créneau rempli entre-temps faisait échouer
 * l'affectation ; `OrdersService` attrapait l'erreur et gardait la commande
 * SANS créneau — à raison, l'argent étant déjà encaissé.
 *
 * Le client avait choisi « 17h45 », l'écran le lui avait répété, il avait
 * payé, et sa commande arrivait au comptoir en « dès que prête ». En rafale
 * sur un même horaire, plusieurs clients perdaient l'heure qu'ils croyaient
 * avoir réservée, et personne ne le leur disait.
 *
 * Sur une VRAIE base : la course sur la dernière place est arbitrée par
 * PostgreSQL — une incrémentation conditionnelle — et aucune doublure ne peut
 * en témoigner.
 */
const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('la place du créneau, prise avant le paiement (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);

  const creneaux = url ? new SlotsService(s.prisma, {} as never) : (null as never);

  /** Un panier branché sur le vrai service de créneaux. */
  const paniers = url
    ? new CartService(
        s.prisma,
        {} as never,
        { canAccessEvent: async () => true } as never,
        {
          getConfigForVenue: async () => ({ enabled: false, pointValueCents: 0 }),
          getBalance: async () => 0,
          discountForPoints: () => ({ pointsUsed: 0, discountCents: 0 }),
        } as never,
        creneaux,
        { get: () => undefined } as never,
      )
    : (null as never);

  let sa: string;

  beforeAll(async () => {
    sa = (
      await s.prisma.user.create({
        data: {
          email: `${unique('sa')}@test.fr`,
          passwordHash: 'x',
          displayName: 'SA',
          globalRole: 'SUPER_ADMIN',
        },
      })
    ).id;
  });
  afterAll(async () => {
    await s.prisma.$disconnect();
  });

  /** Un créneau de `capacite` places, et autant de paniers prêts à payer. */
  async function decor(capacite: number, combienDePaniers: number) {
    const o = await creerOrganisationComplete(s.prisma, unique('cre'), sa);
    /**
     * UN COMPTE ENCAISSEUR, sinon `checkout` refuse AVANT d'en arriver au
     * créneau — et c'est le bon ordre : on ne tient pas une place pour un club
     * qui ne peut pas être payé.
     *
     * L'appel à Stripe échouera, lui : le service est doublé par `{}`. C'est
     * voulu, et c'est même l'état qu'on veut éprouver — un échec APRÈS la
     * réservation laisse le panier OUVERT avec sa place, que la péremption ou
     * un changement de créneau rendront.
     */
    await s.prisma.organization.update({
      where: { id: o.org.id },
      data: { stripeAccountId: 'acct_essai', stripeAccountStatus: 'ACTIVE' },
    });
    const creneau = await s.prisma.slot.create({
      data: {
        eventId: o.event.id,
        startAt: new Date(Date.now() + 3_600_000),
        endAt: new Date(Date.now() + 5_400_000),
        capacity: capacite,
        status: SlotStatus.OPEN,
      },
    });
    await s.prisma.stock.create({
      data: {
        productId: o.product.id,
        supplierId: o.supplier.id,
        pickupPointId: o.pickup.id,
        quantity: 1_000,
      },
    });

    const paniersPrets = [];
    for (let i = 0; i < combienDePaniers; i++) {
      const client = await s.prisma.user.create({
        data: {
          email: `${unique('c')}@test.fr`,
          passwordHash: 'x',
          displayName: `Client ${i}`,
          globalRole: 'CUSTOMER',
        },
      });
      const panier = await s.prisma.cart.create({
        data: {
          userId: client.id,
          eventId: o.event.id,
          supplierId: o.supplier.id,
          pickupPointId: o.pickup.id,
          selectedSlotId: creneau.id,
          status: CartStatus.OPEN,
          expiresAt: new Date(Date.now() + 1_800_000),
          items: { create: { productId: o.product.id, quantity: 1 } },
        },
      });
      paniersPrets.push({ client, panier });
    }
    return { o, creneau, paniersPrets };
  }

  const charge = async (slotId: string) =>
    (await s.prisma.slot.findUniqueOrThrow({ where: { id: slotId } })).currentLoad;

  const etat = async (slotId: string) =>
    (await s.prisma.slot.findUniqueOrThrow({ where: { id: slotId } })).status;

  // ─── Prendre la place ──────────────────────────────────────────

  /**
   * Le paiement échoue forcément ici — il n'y a pas de compte Stripe branché.
   * Ce qui compte est ce qui s'est passé AVANT : la place doit être prise, et
   * le panier doit la porter.
   */
  it('PREND la place avant d’appeler Stripe', async () => {
    const { creneau, paniersPrets } = await decor(2, 1);
    const { client, panier } = paniersPrets[0];

    await paniers.checkout(panier.id, client.id).catch(() => undefined);

    expect(await charge(creneau.id)).toBe(1);
    const apres = await s.prisma.cart.findUniqueOrThrow({ where: { id: panier.id } });
    expect(apres.slotReservedAt).not.toBeNull();
  });

  /**
   * LE CAS QUI FAISAIT PERDRE L'HEURE. Deux clients, une seule place : le
   * second doit se le faire dire AVANT de payer, pas découvrir au comptoir
   * que son créneau a sauté.
   */
  it('REFUSE le second client quand il ne reste qu’une place', async () => {
    const { creneau, paniersPrets } = await decor(1, 2);

    await paniers
      .checkout(paniersPrets[0].panier.id, paniersPrets[0].client.id)
      .catch(() => undefined);

    // Le premier a pris la place ; le créneau est complet.
    expect(await charge(creneau.id)).toBe(1);
    expect(await etat(creneau.id)).toBe(SlotStatus.FULL);

    await expect(
      paniers.checkout(paniersPrets[1].panier.id, paniersPrets[1].client.id),
    ).rejects.toThrow(/créneau de retrait vient d’être complet/);

    // Et la capacité n'a PAS été dépassée.
    expect(await charge(creneau.id)).toBe(1);
  });

  /**
   * LA COURSE, celle qu'aucune doublure ne peut éprouver. Cinq clients
   * appuient en même temps sur un créneau de deux places : PostgreSQL
   * arbitre, et il doit en passer exactement deux.
   */
  it('cinq clients SIMULTANÉS sur deux places : exactement deux passent', async () => {
    const { creneau, paniersPrets } = await decor(2, 5);

    const issues = await Promise.allSettled(
      paniersPrets.map((p) => paniers.checkout(p.panier.id, p.client.id)),
    );

    // Le paiement échoue pour tout le monde (pas de Stripe), donc on compte
    // les places réellement prises, pas les succès de checkout.
    expect(await charge(creneau.id)).toBe(2);
    expect(await etat(creneau.id)).toBe(SlotStatus.FULL);

    const tenues = await s.prisma.cart.count({
      where: { id: { in: paniersPrets.map((p) => p.panier.id) }, slotReservedAt: { not: null } },
    });
    expect(tenues).toBe(2);

    // Trois ont été refusés pour créneau complet, et ils le savent.
    const refusesPourCreneau = issues.filter(
      (i) => i.status === 'rejected' && /complet/.test(String(i.reason?.message)),
    );
    expect(refusesPourCreneau).toHaveLength(3);
  });

  /**
   * UN SECOND APPEL AU PAIEMENT NE PREND PAS UNE PLACE DE PLUS.
   *
   * Le client revient sur l'écran de paiement : la clé d'idempotence Stripe
   * lui rend la même session, et il repasse donc par ici. Sans garde, chaque
   * retour consommerait une place.
   */
  it('un SECOND paiement du même panier ne reprend pas de place', async () => {
    const { creneau, paniersPrets } = await decor(5, 1);
    const { client, panier } = paniersPrets[0];

    await paniers.checkout(panier.id, client.id).catch(() => undefined);
    await paniers.checkout(panier.id, client.id).catch(() => undefined);
    await paniers.checkout(panier.id, client.id).catch(() => undefined);

    expect(await charge(creneau.id)).toBe(1);
  });

  // ─── Rendre la place ───────────────────────────────────────────

  /**
   * CHANGER D'HORAIRE REND L'ANCIENNE PLACE. Sans cela, elle resterait tenue
   * pour toujours : personne ne l'occuperait, et le créneau paraîtrait complet
   * alors qu'il est vide.
   */
  it('REND la place quand le client change de créneau', async () => {
    const { o, creneau, paniersPrets } = await decor(3, 1);
    const { client, panier } = paniersPrets[0];
    await paniers.checkout(panier.id, client.id).catch(() => undefined);
    expect(await charge(creneau.id)).toBe(1);

    const autre = await s.prisma.slot.create({
      data: {
        eventId: o.event.id,
        startAt: new Date(Date.now() + 7_200_000),
        endAt: new Date(Date.now() + 9_000_000),
        capacity: 3,
        status: SlotStatus.OPEN,
      },
    });

    await paniers.choisirCreneau(panier.id, client.id, autre.id);

    expect(await charge(creneau.id)).toBe(0);
    // La nouvelle sera prise au paiement, pas maintenant.
    expect(await charge(autre.id)).toBe(0);
    const apres = await s.prisma.cart.findUniqueOrThrow({ where: { id: panier.id } });
    expect(apres.slotReservedAt).toBeNull();
  });

  it('ne rend RIEN quand le client repose le MÊME créneau', async () => {
    const { creneau, paniersPrets } = await decor(3, 1);
    const { client, panier } = paniersPrets[0];
    await paniers.checkout(panier.id, client.id).catch(() => undefined);

    await paniers.choisirCreneau(panier.id, client.id, creneau.id);

    // Rendre puis reprendre ouvrirait une fenêtre où un autre peut la
    // prendre : ce n'est pas un changement, on ne touche à rien.
    expect(await charge(creneau.id)).toBe(1);
    const apres = await s.prisma.cart.findUniqueOrThrow({ where: { id: panier.id } });
    expect(apres.slotReservedAt).not.toBeNull();
  });

  /**
   * UN PANIER PÉRIMÉ REND SA PLACE. Un panier OUVERT peut en tenir une : elle
   * est prise avant Stripe, et un appel qui échoue laisse le panier OUVERT
   * avec sa place. Le périmer sans la rendre la perdrait pour la soirée.
   */
  it('REND la place d’un panier périmé', async () => {
    const { creneau, paniersPrets } = await decor(3, 1);
    const { client, panier } = paniersPrets[0];
    await paniers.checkout(panier.id, client.id).catch(() => undefined);
    expect(await charge(creneau.id)).toBe(1);

    await s.prisma.cart.update({
      where: { id: panier.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await expect(paniers.checkout(panier.id, client.id)).rejects.toThrow(/expiré/);

    expect(await charge(creneau.id)).toBe(0);
  });

  /**
   * ET LE CRÉNEAU REDEVIENT PROPOSABLE. Rendre la dernière place d'un créneau
   * COMPLET doit le rouvrir, sinon l'écran de choix continuerait de le cacher
   * alors qu'il a de la place.
   */
  it('ROUVRE un créneau complet quand une place est rendue', async () => {
    const { creneau, paniersPrets } = await decor(1, 1);
    const { client, panier } = paniersPrets[0];
    await paniers.checkout(panier.id, client.id).catch(() => undefined);
    expect(await etat(creneau.id)).toBe(SlotStatus.FULL);

    await creneaux.libererUnePlace(creneau.id);

    expect(await etat(creneau.id)).toBe(SlotStatus.OPEN);
    expect(await charge(creneau.id)).toBe(0);
  });

  /**
   * MAIS PAS UN CRÉNEAU FERMÉ À LA MAIN. Celui-là a été fermé par quelqu'un ;
   * rendre une place ne doit pas annuler sa décision.
   */
  it('ne rouvre PAS un créneau fermé par un humain', async () => {
    const { creneau, paniersPrets } = await decor(3, 1);
    const { client, panier } = paniersPrets[0];
    await paniers.checkout(panier.id, client.id).catch(() => undefined);
    await s.prisma.slot.update({
      where: { id: creneau.id },
      data: { status: SlotStatus.CLOSED },
    });

    await creneaux.libererUnePlace(creneau.id);

    expect(await etat(creneau.id)).toBe(SlotStatus.CLOSED);
  });

  /** Une double libération ne doit pas créer de la capacité qui n'existe pas. */
  it('ne descend JAMAIS sous zéro', async () => {
    const { creneau } = await decor(3, 0);

    await creneaux.libererUnePlace(creneau.id);
    await creneaux.libererUnePlace(creneau.id);

    expect(await charge(creneau.id)).toBe(0);
  });
});
