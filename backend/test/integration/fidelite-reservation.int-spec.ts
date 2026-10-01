/**
 * LA RÉSERVATION DES POINTS — sur une vraie base, parce que c'est un REGISTRE.
 *
 * L'invariant tenu ici ne se démontre pas avec des doublures : la somme des
 * mouvements inscrits doit TOUJOURS égaler le solde du compte. Un point qui
 * manque à l'appel, c'est une remise offerte ou un client volé, et ça ne se voit
 * que des semaines plus tard, quand plus personne ne sait d'où vient l'écart.
 *
 * Le défaut corrigé en phase 53 : les points étaient débités dans la transaction
 * de création de commande, donc APRÈS la confirmation de Stripe. Dépensés
 * entre-temps, ils annulaient la commande d'une carte déjà débitée.
 */
import { CartStatus, LoyaltyEntryKind } from '@prisma/client';
import { LoyaltyService } from '../../src/modules/loyalty/loyalty.service';
import { monterServices, unique, creerOrganisationComplete } from './banc';

const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('réservation des points de fidélité (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);
  const fidelite = url ? new LoyaltyService(s.prisma) : (null as never);

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

  /** Un client avec un solde chez un club, et un panier ouvert. */
  async function clientAvecSolde(solde: number) {
    const o = await creerOrganisationComplete(s.prisma, unique('bar'), sa);
    const client = await s.prisma.user.create({
      data: {
        email: `${unique('client')}@test.fr`,
        passwordHash: 'x',
        displayName: 'Client',
        globalRole: 'CUSTOMER',
      },
    });
    const compte = await s.prisma.loyaltyAccount.create({
      data: { userId: client.id, organizationId: o.org.id, balance: solde },
    });
    // Le solde initial est un mouvement comme un autre : sans lui, la somme du
    // registre ne pourrait pas égaler le solde.
    await s.prisma.loyaltyTransaction.create({
      data: {
        accountId: compte.id,
        kind: LoyaltyEntryKind.ADJUST,
        points: solde,
        balanceAfter: solde,
      },
    });
    const panier = await s.prisma.cart.create({
      data: {
        userId: client.id,
        eventId: o.event.id,
        supplierId: o.supplier.id,
        pickupPointId: o.pickup.id,
        status: CartStatus.OPEN,
        expiresAt: new Date(Date.now() + 1_800_000),
      },
    });
    return { o, client, compte, panier };
  }

  /** La somme du registre, qui doit égaler le solde — toujours. */
  async function sommeDuRegistre(accountId: string): Promise<number> {
    const { _sum } = await s.prisma.loyaltyTransaction.aggregate({
      where: { accountId },
      _sum: { points: true },
    });
    return _sum.points ?? 0;
  }

  async function solde(accountId: string): Promise<number> {
    const { balance } = await s.prisma.loyaltyAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: { balance: true },
    });
    return balance;
  }

  it('RÉSERVER débite le solde tout de suite, et le registre suit', async () => {
    const c = await clientAvecSolde(100);

    const reserves = await fidelite.holdForCart({
      cartId: c.panier.id,
      userId: c.client.id,
      organizationId: c.o.org.id,
      points: 30,
    });

    expect(reserves).toBe(30);
    expect(await solde(c.compte.id)).toBe(70);
    expect(await sommeDuRegistre(c.compte.id)).toBe(70);

    // Le panier porte sa réservation : c'est par lui qu'elle devient dépense.
    const panier = await s.prisma.cart.findUniqueOrThrow({ where: { id: c.panier.id } });
    expect(panier.loyaltyHoldId).not.toBeNull();
  });

  it('un solde insuffisant est REFUSÉ, et ne laisse aucune trace', async () => {
    // Le refus arrive AVANT le paiement : c'est tout l'objet de la réservation.
    const c = await clientAvecSolde(10);

    await expect(
      fidelite.holdForCart({
        cartId: c.panier.id,
        userId: c.client.id,
        organizationId: c.o.org.id,
        points: 50,
      }),
    ).rejects.toThrow(/insuffisant/i);

    expect(await solde(c.compte.id)).toBe(10);
    expect(await sommeDuRegistre(c.compte.id)).toBe(10);
  });

  it('deux paniers du MÊME client ne dépensent pas les mêmes points', async () => {
    // Le premier les a retirés du solde : le second ne les trouve plus. C'est la
    // base qui arbitre, dans la même instruction que le débit.
    const c = await clientAvecSolde(40);
    const second = await s.prisma.cart.create({
      data: {
        userId: c.client.id,
        eventId: c.o.event.id,
        supplierId: c.o.supplier.id,
        pickupPointId: c.o.pickup.id,
        status: CartStatus.OPEN,
        expiresAt: new Date(Date.now() + 1_800_000),
      },
    });

    await fidelite.holdForCart({
      cartId: c.panier.id,
      userId: c.client.id,
      organizationId: c.o.org.id,
      points: 40,
    });

    await expect(
      fidelite.holdForCart({
        cartId: second.id,
        userId: c.client.id,
        organizationId: c.o.org.id,
        points: 40,
      }),
    ).rejects.toThrow(/insuffisant/i);

    expect(await solde(c.compte.id)).toBe(0);
    expect(await sommeDuRegistre(c.compte.id)).toBe(0);
  });

  it('RENDRE une réservation ramène le solde, et le registre reste juste', async () => {
    const c = await clientAvecSolde(100);
    await fidelite.holdForCart({
      cartId: c.panier.id,
      userId: c.client.id,
      organizationId: c.o.org.id,
      points: 25,
    });

    const rendus = await fidelite.releaseHoldForCart(c.panier.id);

    expect(rendus).toBe(25);
    expect(await solde(c.compte.id)).toBe(100);
    expect(await sommeDuRegistre(c.compte.id)).toBe(100);

    const mouvements = await s.prisma.loyaltyTransaction.findMany({
      where: { accountId: c.compte.id },
      orderBy: { createdAt: 'asc' },
      select: { kind: true, points: true },
    });
    expect(mouvements.map((m) => m.kind)).toEqual([
      LoyaltyEntryKind.ADJUST,
      LoyaltyEntryKind.HOLD,
      LoyaltyEntryKind.RELEASE,
    ]);
  });

  it('la ronde rend les réservations des paniers EXPIRÉS, et seulement elles', async () => {
    // Sans ce retour, un panier abandonné emporterait les points : le client les
    // verrait disparaître de son solde sans avoir rien reçu.
    const perdu = await clientAvecSolde(100);
    const vivant = await clientAvecSolde(100);

    await fidelite.holdForCart({
      cartId: perdu.panier.id,
      userId: perdu.client.id,
      organizationId: perdu.o.org.id,
      points: 20,
    });
    await fidelite.holdForCart({
      cartId: vivant.panier.id,
      userId: vivant.client.id,
      organizationId: vivant.o.org.id,
      points: 20,
    });
    await s.prisma.cart.update({
      where: { id: perdu.panier.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });

    await fidelite.rendreLesReservationsExpirees();

    expect(await solde(perdu.compte.id)).toBe(100);
    // Le panier encore valable garde ses points réservés : son client est
    // peut-être devant sa feuille de paiement.
    expect(await solde(vivant.compte.id)).toBe(80);
  });

  it('CONVERTIR la réservation en dépense ne retouche pas au solde', async () => {
    // C'est ce qui rend l'étape incapable d'échouer, donc incapable de faire
    // perdre une commande déjà payée. Un seul mouvement par dépense : la somme
    // du registre reste égale au solde.
    const c = await clientAvecSolde(100);
    await fidelite.holdForCart({
      cartId: c.panier.id,
      userId: c.client.id,
      organizationId: c.o.org.id,
      points: 30,
    });
    const commande = await s.prisma.order.create({
      data: {
        publicOrderNumber: unique('BE'),
        userId: c.client.id,
        organizationId: c.o.org.id,
        eventId: c.o.event.id,
        venueId: c.o.venue.id,
        supplierId: c.o.supplier.id,
        pickupPointId: c.o.pickup.id,
        status: 'PAID',
        subtotalCents: 700,
        totalCents: 700,
      } as never,
    });

    const points = await s.prisma.$transaction((tx) =>
      fidelite.convertHoldToRedeemTx(tx, { cartId: c.panier.id, orderId: commande.id }),
    );

    expect(points).toBe(30);
    expect(await solde(c.compte.id)).toBe(70);
    expect(await sommeDuRegistre(c.compte.id)).toBe(70);

    const mouvements = await s.prisma.loyaltyTransaction.findMany({
      where: { accountId: c.compte.id, kind: LoyaltyEntryKind.REDEEM },
    });
    expect(mouvements).toHaveLength(1);
    expect(mouvements[0]?.orderId).toBe(commande.id);
  });

  it('une réservation déjà convertie n’est plus RENDUE — la commande est payée', async () => {
    const c = await clientAvecSolde(100);
    await fidelite.holdForCart({
      cartId: c.panier.id,
      userId: c.client.id,
      organizationId: c.o.org.id,
      points: 30,
    });
    const commande = await s.prisma.order.create({
      data: {
        publicOrderNumber: unique('BE'),
        userId: c.client.id,
        organizationId: c.o.org.id,
        eventId: c.o.event.id,
        venueId: c.o.venue.id,
        supplierId: c.o.supplier.id,
        pickupPointId: c.o.pickup.id,
        status: 'PAID',
        subtotalCents: 700,
        totalCents: 700,
      } as never,
    });
    await s.prisma.$transaction((tx) =>
      fidelite.convertHoldToRedeemTx(tx, { cartId: c.panier.id, orderId: commande.id }),
    );

    // Panier expiré APRÈS la commande : la ronde passe, et ne doit rien rendre.
    await s.prisma.cart.update({
      where: { id: c.panier.id },
      data: { expiresAt: new Date(Date.now() - 60_000) },
    });
    await fidelite.rendreLesReservationsExpirees();

    expect(await solde(c.compte.id)).toBe(70);
    expect(await sommeDuRegistre(c.compte.id)).toBe(70);
  });
});
