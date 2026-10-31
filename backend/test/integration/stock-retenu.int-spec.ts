import { CartStatus } from '@prisma/client';
import { CartService } from '../../src/modules/cart/cart.service';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { monterServices, unique, creerOrganisationComplete } from './banc';

/**
 * DEUX CLIENTS SUR LA DERNIÈRE BIÈRE : UN SEUL DOIT PAYER.
 *
 * Le stock était CONTRÔLÉ avant Stripe, jamais RETENU. Une lecture n'empêche
 * aucun autre panier de lire la même quantité : les deux lisaient « il en
 * reste une », passaient tous les deux, et payaient tous les deux.
 *
 * Passé le débit, `decrementerStock` ne pouvait plus rien refuser — son
 * commentaire le dit : « il CONSTATE ». Il mettait l'étagère à zéro, retirait
 * le produit de la carte, et créait la commande quand même. Le comptoir devait
 * substituer ou rembourser, devant le client.
 *
 * ── POURQUOI CES TESTS NE PEUVENT PAS ÊTRE UNITAIRES ───────────
 *
 * La retenue est une incrémentation CONDITIONNELLE : `UPDATE … WHERE
 * quantity - reserved >= n`. C'est PostgreSQL qui arbitre la dernière unité, et
 * une doublure rendrait ce qu'on lui a dit de rendre. Deux appels réellement
 * simultanés sur une vraie base sont la seule façon de le savoir.
 */
const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('le stock retenu avant le paiement (base réelle)', () => {
  const s = url ? monterServices(url) : (null as never);

  const paniers = url
    ? new CartService(
        s.prisma,
        {} as never,
        { canAccessEvent: async () => true } as never,
        {
          getConfigForVenue: async () => ({ enabled: false, pointValueCents: 0 }),
          getBalance: async () => 0,
          discountForPoints: () => ({ pointsUsed: 0, discountCents: 0 }),
          releaseHoldForCart: async () => 0,
        } as never,
        { reserverUnePlace: async () => undefined, libererUnePlace: async () => undefined } as never,
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

  /** Une étagère de `stock` unités, et `combien` paniers qui en veulent `parPanier`. */
  async function decor(stock: number, combien: number, parPanier = 1) {
    const o = await creerOrganisationComplete(s.prisma, unique('stk'), sa);
    // Un compte encaisseur, sinon `checkout` refuse avant d'en arriver au
    // stock — et c'est le bon ordre : on ne retient rien pour un club qui ne
    // peut pas être payé.
    await s.prisma.organization.update({
      where: { id: o.org.id },
      data: { stripeAccountId: 'acct_essai', stripeAccountStatus: 'ACTIVE' },
    });
    await s.prisma.stock.create({
      data: {
        productId: o.product.id,
        supplierId: o.supplier.id,
        pickupPointId: o.pickup.id,
        quantity: stock,
      },
    });

    const prets = [];
    for (let i = 0; i < combien; i++) {
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
          status: CartStatus.OPEN,
          expiresAt: new Date(Date.now() + 1_800_000),
          items: { create: { productId: o.product.id, quantity: parPanier } },
        },
      });
      prets.push({ client, panier });
    }
    return { o, prets };
  }

  /** Ce que l'étagère dit : sur l'étagère, retenu, et disponible. */
  async function etagere(productId: string) {
    const l = await s.prisma.stock.findFirstOrThrow({ where: { productId } });
    return { sur: l.quantity, retenu: l.reserved, dispo: l.quantity - l.reserved };
  }

  // ─── Retenir ───────────────────────────────────────────────────

  it('RETIENT les articles avant d’appeler Stripe', async () => {
    const { o, prets } = await decor(5, 1, 2);

    await paniers.checkout(prets[0].panier.id, prets[0].client.id).catch(() => undefined);

    expect(await etagere(o.product.id)).toEqual({ sur: 5, retenu: 2, dispo: 3 });
    const apres = await s.prisma.cart.findUniqueOrThrow({ where: { id: prets[0].panier.id } });
    expect(apres.stockReservedAt).not.toBeNull();
  });

  /**
   * LE CAS QUI FAISAIT PAYER DEUX FOIS LA MÊME BIÈRE. Le second doit se le
   * faire dire AVANT de payer, pas découvrir au comptoir qu'on ne peut pas le
   * servir.
   */
  it('REFUSE le second client sur la dernière unité', async () => {
    const { o, prets } = await decor(1, 2);

    await paniers.checkout(prets[0].panier.id, prets[0].client.id).catch(() => undefined);
    expect((await etagere(o.product.id)).dispo).toBe(0);

    await expect(
      paniers.checkout(prets[1].panier.id, prets[1].client.id),
    ).rejects.toThrow(/n’en reste que 0/);

    // Et l'étagère n'a PAS été dépassée.
    expect(await etagere(o.product.id)).toEqual({ sur: 1, retenu: 1, dispo: 0 });
  });

  /**
   * LA COURSE. Cinq clients appuient en même temps sur trois bières :
   * PostgreSQL arbitre, et il doit en passer exactement trois.
   */
  it('cinq clients SIMULTANÉS sur trois unités : exactement trois passent', async () => {
    const { o, prets } = await decor(3, 5);

    const issues = await Promise.allSettled(
      prets.map((p) => paniers.checkout(p.panier.id, p.client.id)),
    );

    expect(await etagere(o.product.id)).toEqual({ sur: 3, retenu: 3, dispo: 0 });

    const tenus = await s.prisma.cart.count({
      where: { id: { in: prets.map((p) => p.panier.id) }, stockReservedAt: { not: null } },
    });
    expect(tenus).toBe(3);

    // Les deux autres ont été refusés POUR LE STOCK, et ils savent ce qui reste.
    const refusesStock = issues.filter(
      (i) => i.status === 'rejected' && /n’en reste que/.test(String(i.reason?.message)),
    );
    expect(refusesStock).toHaveLength(2);
  });

  /**
   * TOUT OU RIEN. Un panier de deux produits dont le second manque ne doit pas
   * partir au paiement avec le premier retenu : le client paierait un contenu
   * que personne n'a voulu.
   */
  it('n’en retient AUCUN quand une seule ligne manque', async () => {
    const { o, prets } = await decor(10, 1);
    const rare = await s.prisma.product.create({
      data: {
        supplierId: o.supplier.id,
        categoryId: o.product.categoryId,
        name: 'Produit rare',
        price: 500,
      },
    });
    await s.prisma.stock.create({
      data: {
        productId: rare.id,
        supplierId: o.supplier.id,
        pickupPointId: o.pickup.id,
        quantity: 1,
      },
    });
    await s.prisma.cartItem.create({
      data: { cartId: prets[0].panier.id, productId: rare.id, quantity: 5 },
    });

    await expect(
      paniers.checkout(prets[0].panier.id, prets[0].client.id),
    ).rejects.toThrow(/Produit rare/);

    // Le premier produit n'a RIEN de retenu : la transaction a tout annulé.
    expect((await etagere(o.product.id)).retenu).toBe(0);
    expect((await etagere(rare.id)).retenu).toBe(0);
  });

  it('un SECOND paiement du même panier ne retient pas davantage', async () => {
    const { o, prets } = await decor(10, 1, 2);

    await paniers.checkout(prets[0].panier.id, prets[0].client.id).catch(() => undefined);
    await paniers.checkout(prets[0].panier.id, prets[0].client.id).catch(() => undefined);
    await paniers.checkout(prets[0].panier.id, prets[0].client.id).catch(() => undefined);

    expect((await etagere(o.product.id)).retenu).toBe(2);
  });

  // ─── Rendre ────────────────────────────────────────────────────

  /**
   * UNE RETENUE POSÉE SUR UN CONTENU QUI N'EST PLUS LE BON NE VAUT RIEN. Sans
   * cela, un client qui ajuste son panier après un paiement raté laisserait
   * ses anciens articles gelés pour la soirée.
   */
  it('REND la retenue quand le contenu du panier change', async () => {
    const { o, prets } = await decor(10, 1, 3);
    await paniers.checkout(prets[0].panier.id, prets[0].client.id).catch(() => undefined);
    expect((await etagere(o.product.id)).retenu).toBe(3);

    await paniers.remplacerLesArticles(prets[0].panier.id, prets[0].client.id, {
      items: [{ productId: o.product.id, quantity: 1 }],
    } as never);

    expect((await etagere(o.product.id)).retenu).toBe(0);
    const apres = await s.prisma.cart.findUniqueOrThrow({ where: { id: prets[0].panier.id } });
    expect(apres.stockReservedAt).toBeNull();
  });

  it('REND la retenue d’un panier périmé', async () => {
    const { o, prets } = await decor(10, 1, 4);
    await paniers.checkout(prets[0].panier.id, prets[0].client.id).catch(() => undefined);
    expect((await etagere(o.product.id)).retenu).toBe(4);

    await s.prisma.cart.update({
      where: { id: prets[0].panier.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    await expect(
      paniers.checkout(prets[0].panier.id, prets[0].client.id),
    ).rejects.toThrow(/expiré/);

    expect((await etagere(o.product.id)).retenu).toBe(0);
  });

  /**
   * ET LE PANIER SUIVANT PEUT ALORS ACHETER. C'est la raison d'être de toutes
   * ces libérations : sans elles, une étagère annoncée vide serait pleine en
   * fin de soirée, et le club aurait refusé des clients pour rien.
   */
  it('ce qui est rendu redevient ACHETABLE', async () => {
    const { o, prets } = await decor(1, 2);
    await paniers.checkout(prets[0].panier.id, prets[0].client.id).catch(() => undefined);

    // Le second est refusé : il ne reste rien.
    await expect(
      paniers.checkout(prets[1].panier.id, prets[1].client.id),
    ).rejects.toThrow(/n’en reste que 0/);

    // Le premier abandonne — son panier périme.
    await s.prisma.cart.update({
      where: { id: prets[0].panier.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    await paniers.checkout(prets[0].panier.id, prets[0].client.id).catch(() => undefined);

    // Le second passe, maintenant.
    expect((await etagere(o.product.id)).dispo).toBe(1);
    await paniers.checkout(prets[1].panier.id, prets[1].client.id).catch(() => undefined);
    expect((await etagere(o.product.id)).retenu).toBe(1);
  });

  // ─── Consommer ─────────────────────────────────────────────────

  /**
   * LA COMMANDE CRÉÉE CONSOMME : `quantity` et `reserved` descendent ENSEMBLE.
   *
   * Décrémenter l'un sans l'autre laisserait une retenue orpheline qui
   * gèlerait du stock pour toujours — l'erreur exacte qu'on fait en ajoutant
   * une réservation à un code qui décrémentait déjà.
   */
  it('la commande créée fait descendre l’étagère ET rend la retenue', async () => {
    const { o, prets } = await decor(10, 1, 3);
    await paniers.checkout(prets[0].panier.id, prets[0].client.id).catch(() => undefined);
    expect(await etagere(o.product.id)).toEqual({ sur: 10, retenu: 3, dispo: 7 });

    const commandes = new OrdersService(
      s.prisma,
      {} as never, // machine d'etat : pas sollicitee a la creation
      {
        preparerNewOrder: () => ({
          eventId: 'x',
          eventName: 'new_order',
          rooms: [],
          payload: {},
        }),
        deposer: async () => undefined,
        publier: () => undefined,
      } as never,
      { assignOrderToSlot: async () => undefined } as never,
      {
        getConfigForVenue: async () => ({ enabled: false, pointValueCents: 0 }),
        discountForPoints: () => ({ pointsUsed: 0, discountCents: 0 }),
        convertHoldToRedeemTx: async () => 0,
      } as never,
      { onOrderStatusChanged: async () => undefined } as never,
    );
    /**
     * CE QU'UN STRIPE RÉUSSI AURAIT FAIT : geler les prix et engager le
     * panier. La doublure Stripe de ce fichier échoue (c'est voulu — on
     * éprouve la retenue, pas le paiement), donc on pose nous-mêmes l'état
     * que la création de commande exige.
     */
    await s.prisma.cartItem.updateMany({
      where: { cartId: prets[0].panier.id },
      data: { priceSnapshotCents: o.product.price },
    });
    await s.prisma.cart.update({
      where: { id: prets[0].panier.id },
      data: { status: CartStatus.CHECKOUT_PENDING },
    });

    // PAS de `.catch` : si la création échoue, on veut le savoir — c'est tout
    // l'objet de ce test.
    await commandes.createFromPaymentIntent(
      `pi_${Date.now()}`,
      { amount: 2100, currency: 'eur', metadata: { cartId: prets[0].panier.id } },
      {} as never,
    );

    const apres = await etagere(o.product.id);
    // Sept sur l'étagère, et PLUS RIEN de retenu.
    expect(apres).toEqual({ sur: 7, retenu: 0, dispo: 7 });
  });
});
