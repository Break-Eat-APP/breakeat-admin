/**
 * L'ENVOI D'UNE ARDOISE — les garanties que seule la base peut donner.
 *
 * Trois propriétés de la phase 53, et la reprise ajoutée en phase 55. Aucune ne
 * se démontre avec des doublures : l'index unique, la course entre deux appels
 * simultanés et l'état réellement écrit vivent dans PostgreSQL.
 *
 * Ce qui est en jeu : de l'argent déjà encaissé. Une ardoise qui part deux fois
 * facture deux tournées ; une ardoise bloquée laisse des convives débités sans
 * rien recevoir.
 */
import { OrderSplitShareStatus, OrderSplitStatus } from '@prisma/client';
import { OrderSplitsService } from '../../src/modules/order-splits/order-splits.service';
import { monterServices, unique, creerOrganisationComplete, creerCommande } from './banc';

const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('envoi d’ardoise (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);

  /** Ce que Stripe a reçu, sans Stripe. */
  const stripe = {
    rembourses: [] as string[],
    liberees: [] as string[],
    capturePaymentIntent: async () => ({}),
    cancelPaymentIntent: async (pi: string) => {
      stripe.liberees.push(pi);
      return {};
    },
    refundPaymentIntent: async ({ paymentIntentId }: { paymentIntentId: string }) => {
      stripe.rembourses.push(paymentIntentId);
      return {};
    },
  };

  const ardoises = url
    ? new OrderSplitsService(
        s.prisma,
        stripe as never,
        {} as never,
        { get: (cle: string) => (cle === 'app.split.enabled' ? true : '') } as never,
      )
    : (null as never);

  let hote: string;

  beforeAll(async () => {
    hote = (
      await s.prisma.user.create({
        data: {
          email: `${unique('hote')}@test.fr`,
          passwordHash: 'x',
          displayName: 'Hôte',
          globalRole: 'CUSTOMER',
        },
      })
    ).id;
  });
  afterAll(async () => {
    await s.prisma.$disconnect();
  });
  beforeEach(() => {
    stripe.rembourses = [];
    stripe.liberees = [];
  });

  /** Une ardoise réelle, dans l'état demandé. */
  async function ouvrirArdoise(statut: OrderSplitStatus = OrderSplitStatus.OPEN) {
    const sa = await s.prisma.user.create({
      data: {
        email: `${unique('sa')}@test.fr`,
        passwordHash: 'x',
        displayName: 'SA',
        globalRole: 'SUPER_ADMIN',
      },
    });
    const o = await creerOrganisationComplete(s.prisma, unique('bar'), sa.id);
    const split = await s.prisma.orderSplit.create({
      data: {
        code: unique('AB').slice(0, 10).toUpperCase(),
        organizationId: o.org.id,
        eventId: o.event.id,
        venueId: o.venue.id,
        supplierId: o.supplier.id,
        pickupPointId: o.pickup.id,
        hostUserId: hote,
        status: statut,
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    return { o, split, sa };
  }

  it('UNE commande par ardoise — la base refuse la seconde', async () => {
    // Le garde-fou qui ne dépend d'aucune lecture préalable : deux appels
    // concurrents ne peuvent pas rattacher deux commandes à la même tournée.
    const a = await ouvrirArdoise();
    const commande = await creerCommande(s.prisma, hote, a.o);

    await s.prisma.orderSplit.update({
      where: { id: a.split.id },
      data: { status: OrderSplitStatus.SENT, orderId: commande.id },
    });

    const b = await ouvrirArdoise();
    await expect(
      s.prisma.orderSplit.update({
        where: { id: b.split.id },
        data: { status: OrderSplitStatus.SENT, orderId: commande.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('les ardoises OUVERTES ne se gênent pas — les `order_id` nuls sont distincts', async () => {
    // L'index unique porte sur une colonne nullable : si Postgres traitait les
    // NULL comme égaux, une seule ardoise pourrait être ouverte à la fois dans
    // toute la plateforme.
    await ouvrirArdoise();
    await ouvrirArdoise();

    const ouvertes = await s.prisma.orderSplit.count({
      where: { status: OrderSplitStatus.OPEN, orderId: null },
    });
    expect(ouvertes).toBeGreaterThanOrEqual(2);
  });

  it('la REVENDICATION de l’envoi n’est gagnée qu’une fois', async () => {
    // Deux appuis simultanés sur « envoyer ». Avant la phase 53, les deux
    // lisaient « OPEN », encaissaient les mêmes parts et créaient deux
    // commandes. C'est la base qui tranche, pas une lecture préalable.
    const { split } = await ouvrirArdoise();

    const revendiquer = () =>
      s.prisma.orderSplit.updateMany({
        where: { id: split.id, status: OrderSplitStatus.OPEN },
        data: { status: OrderSplitStatus.SENDING },
      });

    const [un, deux] = await Promise.all([revendiquer(), revendiquer()]);

    expect([un.count, deux.count].sort()).toEqual([0, 1]);
    const relu = await s.prisma.orderSplit.findUniqueOrThrow({ where: { id: split.id } });
    expect(relu.status).toBe(OrderSplitStatus.SENDING);
  });

  it('un envoi INTERROMPU est rattrapé : l’argent est rendu, l’ardoise en échec', async () => {
    // Le défaut de la phase 55 : si le serveur tombe entre l'encaissement et la
    // création de la commande, l'ardoise restait en SENDING pour toujours —
    // avec de l'argent pris et aucune commande.
    const { split } = await ouvrirArdoise(OrderSplitStatus.SENDING);
    const part = await s.prisma.orderSplitShare.create({
      data: {
        splitId: split.id,
        claimantName: 'Marc',
        amountCents: 850,
        status: OrderSplitShareStatus.CAPTURED,
        stripePaymentIntentId: unique('pi'),
      },
    });
    // Vieille de vingt minutes : au-delà de la patience de dix minutes.
    await s.prisma.$executeRaw`
      UPDATE order_splits SET updated_at = now() - interval '20 minutes' WHERE id = ${split.id}
    `;

    await ardoises.rattraperEnvoisInterrompus();

    expect(stripe.rembourses).toContain(part.stripePaymentIntentId);
    const [ardoise, relue] = await Promise.all([
      s.prisma.orderSplit.findUniqueOrThrow({ where: { id: split.id } }),
      s.prisma.orderSplitShare.findUniqueOrThrow({ where: { id: part.id } }),
    ]);
    expect(ardoise.status).toBe(OrderSplitStatus.FAILED);
    expect(relue.status).toBe(OrderSplitShareStatus.REFUNDED);
  });

  it('une tournée en train de PARTIR n’est jamais remboursée', async () => {
    // Un envoi normal dure quelques secondes. Rembourser au milieu serait bien
    // pire que l'incident réparé : les convives seraient débités, remboursés,
    // et la commande partirait quand même en cuisine.
    const { split } = await ouvrirArdoise(OrderSplitStatus.SENDING);
    await s.prisma.orderSplitShare.create({
      data: {
        splitId: split.id,
        amountCents: 550,
        status: OrderSplitShareStatus.CAPTURED,
        stripePaymentIntentId: unique('pi'),
      },
    });

    await ardoises.rattraperEnvoisInterrompus();

    expect(stripe.rembourses).toHaveLength(0);
    const relu = await s.prisma.orderSplit.findUniqueOrThrow({ where: { id: split.id } });
    expect(relu.status).toBe(OrderSplitStatus.SENDING);
  });

  it('une ardoise qui porte DÉJÀ sa commande n’est pas remboursée, même ancienne', async () => {
    // La commande et le lien sont écrits dans la même transaction : `order_id`
    // rempli prouve que la tournée est partie et que les convives sont servis.
    const a = await ouvrirArdoise(OrderSplitStatus.SENDING);
    const commande = await creerCommande(s.prisma, hote, a.o);
    await s.prisma.orderSplit.update({
      where: { id: a.split.id },
      data: { orderId: commande.id },
    });
    await s.prisma.orderSplitShare.create({
      data: {
        splitId: a.split.id,
        amountCents: 700,
        status: OrderSplitShareStatus.CAPTURED,
        stripePaymentIntentId: unique('pi'),
      },
    });
    await s.prisma.$executeRaw`
      UPDATE order_splits SET updated_at = now() - interval '20 minutes' WHERE id = ${a.split.id}
    `;

    await ardoises.rattraperEnvoisInterrompus();

    expect(stripe.rembourses).toHaveLength(0);
  });

  it('les parts d’une ardoise supprimée s’en vont avec elle', async () => {
    // Cascade déclarée au schéma : sans elle, les parts deviendraient des
    // orphelines que plus aucun écran ne montre et que la comptabilité compte.
    const { split } = await ouvrirArdoise();
    await s.prisma.orderSplitShare.create({
      data: { splitId: split.id, amountCents: 100, stripePaymentIntentId: unique('pi') },
    });

    await s.prisma.orderSplit.delete({ where: { id: split.id } });

    expect(await s.prisma.orderSplitShare.count({ where: { splitId: split.id } })).toBe(0);
  });
});
