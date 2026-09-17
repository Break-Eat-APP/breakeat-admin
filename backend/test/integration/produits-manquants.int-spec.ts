/**
 * Produits manquants : du comptoir jusqu'au téléphone du client.
 *
 * Base réelle (la contrainte CHECK sur `missing_quantity` n'existe que là),
 * vrais services ; seuls APNs, Expo et le temps réel sont remplacés, pour lire
 * exactement ce qui partirait vers le téléphone.
 *
 * Lancer : DATABASE_URL_TEST=postgresql://… pnpm test:integration
 */
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { LiveActivityService } from '../../src/modules/live-activity/live-activity.service';
import { ProduitsManquantsService } from '../../src/modules/orders/produits-manquants.service';
import { ProductsService } from '../../src/modules/products/products.service';
import { monterServices, unique, creerOrganisationComplete } from './banc';

const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

type Envoi = { jeton: string; evenement: string; etat: Record<string, unknown>; alerte?: unknown };

decrire('produits manquants (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);

  const envoisApns: Envoi[] = [];
  const apns = {
    sendLiveActivityUpdate: async (
      jeton: string,
      evenement: string,
      etat: Record<string, unknown>,
      options: { alert?: unknown },
    ) => {
      envoisApns.push({ jeton, evenement, etat, alerte: options.alert });
      return { ok: true, status: 200, tokenInvalid: false };
    },
    environmentLabel: () => 'test',
    keyIdLabel: () => 'test',
  };
  const envoisExpo: Array<Record<string, unknown>> = [];
  const expo = {
    send: async (messages: Array<Record<string, unknown>>) => {
      envoisExpo.push(...messages);
      return { sent: messages.length, failed: 0, invalidTokens: [] };
    },
  };
  const jetonsPush = new Map<string, string[]>();
  const pushTokens = {
    tokensForUsers: async (ids: string[]) => ids.flatMap((id) => jetonsPush.get(id) ?? []),
  };
  const evenementsTempsReel: unknown[] = [];
  const realtime = { emitOrderUpdated: (p: unknown) => evenementsTempsReel.push(p) };

  const liveActivity = url ? new LiveActivityService(s.prisma, apns as never) : (null as never);
  const service = url
    ? new ProduitsManquantsService(
        s.prisma,
        realtime as never,
        liveActivity,
        expo as never,
        pushTokens as never,
      )
    : (null as never);
  const produits = url ? new ProductsService(s.prisma) : (null as never);

  /** Laisse partir les envois « fire-and-forget » du service. */
  const laisserPartir = () => new Promise((r) => setTimeout(r, 150));

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
  beforeEach(() => {
    envoisApns.length = 0;
    envoisExpo.length = 0;
    evenementsTempsReel.length = 0;
  });

  /** Une commande prête : 2 bières et 1 frites, numéro du jour 18. */
  async function commandePrete(options: { liveActivity?: boolean } = {}) {
    const client = await s.prisma.user.create({
      data: { email: `${unique('client')}@test.fr`, passwordHash: 'x', displayName: 'Client' },
    });
    const o = await creerOrganisationComplete(s.prisma, unique('org'), sa);
    const frites = await s.prisma.product.create({
      data: {
        supplierId: o.supplier.id,
        categoryId: (
          await s.prisma.category.findFirstOrThrow({ where: { supplierId: o.supplier.id } })
        ).id,
        name: 'Frites',
        price: 400,
      },
    });
    const commande = await s.prisma.order.create({
      data: {
        publicOrderNumber: unique('BE'),
        dailyNumber: 18,
        userId: client.id,
        organizationId: o.org.id,
        eventId: o.event.id,
        venueId: o.venue.id,
        supplierId: o.supplier.id,
        pickupPointId: o.pickup.id,
        status: 'READY',
        subtotalCents: 1800,
        totalCents: 1800,
        items: {
          create: [
            {
              productId: o.product.id,
              productNameSnapshot: 'Bière',
              unitPriceCentsSnapshot: 700,
              quantity: 2,
              lineTotalCents: 1400,
            },
            {
              productId: frites.id,
              productNameSnapshot: 'Frites',
              unitPriceCentsSnapshot: 400,
              quantity: 1,
              lineTotalCents: 400,
            },
          ],
        },
      },
      include: { items: true },
    });
    if (options.liveActivity) {
      await s.prisma.liveActivity.create({
        data: {
          userId: client.id,
          orderId: commande.id,
          activityId: unique('act'),
          pushToken: unique('la'),
        },
      });
    }
    const biere = commande.items.find((l) => l.productNameSnapshot === 'Bière')!;
    const ligneFrites = commande.items.find((l) => l.productNameSnapshot === 'Frites')!;
    return { client, o, commande, biere, ligneFrites, frites };
  }

  it('signale une bière sur deux : la commande, la carte, l’historique et la Live Activity suivent', async () => {
    const c = await commandePrete({ liveActivity: true });

    const r = await service.signaler({
      orderId: c.commande.id,
      actorId: sa,
      lignes: [{ orderItemId: c.biere.id, missingQuantity: 1 }],
      retirerDeLaCarte: true,
    });
    await laisserPartir();

    expect(r.produitsRetiresDeLaCarte).toBe(1);
    const apres = await s.prisma.order.findUniqueOrThrow({
      where: { id: c.commande.id },
      include: { items: true },
    });
    expect(apres.missingReportedAt).not.toBeNull();
    expect(apres.status).toBe('READY'); // le statut ne bouge pas
    expect(apres.items.find((l) => l.id === c.biere.id)?.missingQuantity).toBe(1);
    expect(apres.items.find((l) => l.id === c.ligneFrites.id)?.missingQuantity).toBe(0);

    // HS : retiré de la carte (le menu public ne montre que les produits ACTIVE).
    const biere = await s.prisma.product.findUniqueOrThrow({ where: { id: c.o.product.id } });
    expect(biere.status).toBe('OUT_OF_STOCK');
    const frites = await s.prisma.product.findUniqueOrThrow({ where: { id: c.frites.id } });
    expect(frites.status).toBe('ACTIVE');

    const trace = await s.prisma.orderAuditTrail.findFirstOrThrow({
      where: { orderId: c.commande.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(trace.reason).toBe('Produits manquants : 1× Bière');

    // La Live Activity : alerte qui allume l'écran, libellé et détail.
    expect(envoisApns).toHaveLength(1);
    expect(envoisApns[0].evenement).toBe('update');
    expect(envoisApns[0].etat).toMatchObject({
      status: 'READY',
      statusLabel: 'Produit manquant · passez au comptoir',
      missingItems: ['1× Bière'],
      orderNumber: '18',
    });
    expect(envoisApns[0].alerte).toEqual({
      title: 'Produit manquant',
      body: 'Il manque 1× Bière dans votre commande N° 18. Rendez-vous au point de retrait Buvette Nord.',
    });
    // Live Activity atteinte : pas de notification en double.
    expect(envoisExpo).toHaveLength(0);
    expect(evenementsTempsReel).toHaveLength(1);
  });

  it('sans Live Activity, une notification prend le relais', async () => {
    const c = await commandePrete();
    jetonsPush.set(c.client.id, ['ExponentPushToken[abc]']);

    await service.signaler({
      orderId: c.commande.id,
      actorId: sa,
      lignes: [{ orderItemId: c.ligneFrites.id, missingQuantity: 1 }],
      retirerDeLaCarte: false,
    });
    await laisserPartir();

    expect(envoisApns).toHaveLength(0);
    expect(envoisExpo).toEqual([
      expect.objectContaining({
        to: 'ExponentPushToken[abc]',
        title: 'Produit manquant',
        body: expect.stringContaining('Il manque 1× Frites'),
        data: { type: 'missing_items', orderId: c.commande.id },
      }),
    ]);
    // Sans l'option, la carte ne bouge pas.
    const frites = await s.prisma.product.findUniqueOrThrow({ where: { id: c.frites.id } });
    expect(frites.status).toBe('ACTIVE');
  });

  it('revenir sur une erreur : le signalement disparaît, sans réveiller le téléphone', async () => {
    const c = await commandePrete({ liveActivity: true });
    await service.signaler({
      orderId: c.commande.id,
      actorId: sa,
      lignes: [{ orderItemId: c.biere.id, missingQuantity: 2 }],
      retirerDeLaCarte: false,
    });
    await laisserPartir();
    envoisApns.length = 0;

    await service.signaler({
      orderId: c.commande.id,
      actorId: sa,
      lignes: [{ orderItemId: c.biere.id, missingQuantity: 0 }],
      retirerDeLaCarte: false,
    });
    await laisserPartir();

    const apres = await s.prisma.order.findUniqueOrThrow({ where: { id: c.commande.id } });
    expect(apres.missingReportedAt).toBeNull();
    expect(envoisApns).toHaveLength(1);
    expect(envoisApns[0].alerte).toBeUndefined();
    expect(envoisApns[0].etat).toMatchObject({ statusLabel: 'Commande prête', missingItems: [] });
  });

  it('refuse plus de manquants que commandés, sans rien écrire', async () => {
    const c = await commandePrete();
    await expect(
      service.signaler({
        orderId: c.commande.id,
        actorId: sa,
        lignes: [{ orderItemId: c.ligneFrites.id, missingQuantity: 2 }],
        retirerDeLaCarte: true,
      }),
    ).rejects.toThrow(BadRequestException);
    const apres = await s.prisma.order.findUniqueOrThrow({ where: { id: c.commande.id } });
    expect(apres.missingReportedAt).toBeNull();
  });

  it('refuse une ligne qui appartient à une AUTRE commande', async () => {
    const a = await commandePrete();
    const b = await commandePrete();
    await expect(
      service.signaler({
        orderId: a.commande.id,
        actorId: sa,
        lignes: [{ orderItemId: b.biere.id, missingQuantity: 1 }],
        retirerDeLaCarte: false,
      }),
    ).rejects.toThrow(/ne fait pas partie/);
  });

  it('la base elle-même refuse « 5 manquants sur 2 »', async () => {
    const c = await commandePrete();
    await expect(
      s.prisma.orderItem.update({ where: { id: c.biere.id }, data: { missingQuantity: 5 } }),
    ).rejects.toThrow(/order_items_missing_quantity_range/);
  });

  it('refuse une commande déjà remise au client', async () => {
    const c = await commandePrete();
    await s.prisma.order.update({ where: { id: c.commande.id }, data: { status: 'PICKED_UP' } });
    await expect(
      service.signaler({
        orderId: c.commande.id,
        actorId: sa,
        lignes: [{ orderItemId: c.biere.id, missingQuantity: 1 }],
        retirerDeLaCarte: false,
      }),
    ).rejects.toThrow(/terminée/);
  });

  it('ne touche pas un produit masqué par le manager', async () => {
    const c = await commandePrete();
    await s.prisma.product.update({ where: { id: c.o.product.id }, data: { status: 'INACTIVE' } });
    await service.signaler({
      orderId: c.commande.id,
      actorId: sa,
      lignes: [{ orderItemId: c.biere.id, missingQuantity: 1 }],
      retirerDeLaCarte: true,
    });
    const biere = await s.prisma.product.findUniqueOrThrow({ where: { id: c.o.product.id } });
    expect(biere.status).toBe('INACTIVE');
  });

  describe('remettre en vente depuis le comptoir', () => {
    async function operateur(organizationId: string, supplierId: string | null) {
      const u = await s.prisma.user.create({
        data: { email: `${unique('op')}@test.fr`, passwordHash: 'x', displayName: 'Op' },
      });
      await s.prisma.organizationMember.create({
        data: { userId: u.id, organizationId, orgRole: 'OPERATOR', supplierId },
      });
      return u.id;
    }

    it('l’opératrice de la buvette remet un produit HS en vente', async () => {
      const c = await commandePrete();
      await s.prisma.product.update({
        where: { id: c.o.product.id },
        data: { status: 'OUT_OF_STOCK' },
      });
      const op = await operateur(c.o.org.id, c.o.supplier.id);

      const r = await produits.changerDisponibilite(
        c.o.org.id,
        c.o.supplier.id,
        c.o.product.id,
        op,
        true,
      );

      expect(r.status).toBe('ACTIVE');
    });

    it('refuse la buvette d’à côté', async () => {
      const c = await commandePrete();
      const autre = await s.prisma.supplier.create({
        data: { organizationId: c.o.org.id, name: 'Buvette Sud' },
      });
      const op = await operateur(c.o.org.id, autre.id);

      await expect(
        produits.changerDisponibilite(c.o.org.id, c.o.supplier.id, c.o.product.id, op, false),
      ).rejects.toThrow(ForbiddenException);
    });

    it('refuse de remettre en vente un produit masqué par un manager', async () => {
      const c = await commandePrete();
      await s.prisma.product.update({
        where: { id: c.o.product.id },
        data: { status: 'INACTIVE' },
      });
      const op = await operateur(c.o.org.id, c.o.supplier.id);

      await expect(
        produits.changerDisponibilite(c.o.org.id, c.o.supplier.id, c.o.product.id, op, true),
      ).rejects.toThrow(/masqué par un manager/);
    });
  });
});
