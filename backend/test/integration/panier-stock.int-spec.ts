import { CartStatus } from '@prisma/client';
import { CartService } from '../../src/modules/cart/cart.service';
import { monterServices, unique, creerOrganisationComplete } from './banc';

/**
 * LE REFUS NE DOIT RIEN CHANGER AU PANIER.
 *
 * L'ancienne version écrivait la quantité demandée, la ramenait au stock,
 * PUIS levait une erreur. Le client voyait un échec — et son panier avait
 * changé quand même, à une valeur qu'il n'avait pas demandée.
 *
 * Le commentaire du code portait l'hésitation en toutes lettres : « Cap is
 * friendlier? ». La question n'avait jamais été tranchée, et le code faisait
 * les deux : la mutation du plafonnement, le signal du refus.
 *
 * Quelqu'un qui commande dix bières pour son rang et repart avec trois sans
 * l'avoir vu ne l'apprend qu'au comptoir. Ces tests tiennent la règle :
 * **la réponse correspond toujours à l'état du panier.**
 *
 * Sur une VRAIE base, parce que c'est l'état réellement écrit qui est en
 * cause — une doublure dirait ce qu'on lui fait dire.
 */
const url = process.env.DATABASE_URL_TEST;
const decrire = url ? describe : describe.skip;

decrire('panier et stock (base réelle)', () => {
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
        } as never,
        {} as never,
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

  /** Un client, un panier ouvert, et un produit dont le stock est connu. */
  async function decor(stockDisponible: number) {
    const o = await creerOrganisationComplete(s.prisma, unique('bar'), sa);
    const client = await s.prisma.user.create({
      data: {
        email: `${unique('c')}@test.fr`,
        passwordHash: 'x',
        displayName: 'Client',
        globalRole: 'CUSTOMER',
      },
    });
    await s.prisma.stock.create({
      data: {
        productId: o.product.id,
        supplierId: o.supplier.id,
        pickupPointId: o.pickup.id,
        quantity: stockDisponible,
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
    return { o, client, panier };
  }

  /** Ce que le panier contient réellement pour ce produit. */
  const auPanier = async (cartId: string, productId: string) =>
    (await s.prisma.cartItem.findUnique({
      where: { cartId_productId: { cartId, productId } },
      select: { quantity: true },
    }))?.quantity ?? 0;

  it('refuse au-delà du stock, et NE TOUCHE PAS au panier', async () => {
    const { o, client, panier } = await decor(3);

    await expect(
      paniers.addItem(panier.id, client.id, { productId: o.product.id, quantity: 10 } as never),
    ).rejects.toThrow(/reste que 3/);

    // Le point entier : rien n'a été écrit.
    expect(await auPanier(panier.id, o.product.id)).toBe(0);
  });

  it('dit ce qui reste, pour que le client puisse décider', async () => {
    const { o, client, panier } = await decor(3);

    await expect(
      paniers.addItem(panier.id, client.id, { productId: o.product.id, quantity: 10 } as never),
    ).rejects.toThrow(/Ton panier n’a pas été modifié/);
  });

  it('accepte ce qui tient dans le stock', async () => {
    const { o, client, panier } = await decor(3);

    await paniers.addItem(panier.id, client.id, {
      productId: o.product.id,
      quantity: 3,
    } as never);

    expect(await auPanier(panier.id, o.product.id)).toBe(3);
  });

  /**
   * Trois fois deux doit buter au même endroit que six d'un coup : la
   * vérification porte sur le CUMUL, pas sur l'ajout isolé. Sans cela, on
   * contournerait le stock en ajoutant une unité à la fois.
   */
  it('compte le CUMUL, pas seulement l’ajout du moment', async () => {
    const { o, client, panier } = await decor(5);

    await paniers.addItem(panier.id, client.id, { productId: o.product.id, quantity: 2 } as never);
    await paniers.addItem(panier.id, client.id, { productId: o.product.id, quantity: 2 } as never);

    // Le troisième ferait 6 pour un stock de 5.
    await expect(
      paniers.addItem(panier.id, client.id, { productId: o.product.id, quantity: 2 } as never),
    ).rejects.toThrow(/reste que 5/);

    // Et les quatre déjà posés sont intacts.
    expect(await auPanier(panier.id, o.product.id)).toBe(4);
  });

  /**
   * Un produit épuisé est refusé PLUS HAUT, par `assertProductOrderable`, et
   * jamais par la vérification de quantité. Le test suit donc le vrai chemin
   * plutôt que celui qu'on avait imaginé — et vérifie surtout ce qui compte
   * ici : le panier reste intact.
   */
  it('un produit épuisé est refusé en amont, sans toucher au panier', async () => {
    const { o, client, panier } = await decor(0);

    await expect(
      paniers.addItem(panier.id, client.id, { productId: o.product.id, quantity: 1 } as never),
    ).rejects.toThrow(/out of stock/i);

    expect(await auPanier(panier.id, o.product.id)).toBe(0);
  });

  describe('modification d’une ligne existante', () => {
    it('refuse au-delà du stock sans changer la quantité en place', async () => {
      const { o, client, panier } = await decor(3);
      await paniers.addItem(panier.id, client.id, {
        productId: o.product.id,
        quantity: 2,
      } as never);
      const ligne = await s.prisma.cartItem.findFirstOrThrow({ where: { cartId: panier.id } });

      await expect(
        paniers.updateItem(panier.id, ligne.id, client.id, { quantity: 9 } as never),
      ).rejects.toThrow(/reste que 3/);

      // Les deux d'origine sont toujours là — ni 9, ni 3.
      expect(await auPanier(panier.id, o.product.id)).toBe(2);
    });

    it('accepte une réduction, même si le stock a baissé entre-temps', async () => {
      const { o, client, panier } = await decor(5);
      await paniers.addItem(panier.id, client.id, {
        productId: o.product.id,
        quantity: 5,
      } as never);
      const ligne = await s.prisma.cartItem.findFirstOrThrow({ where: { cartId: panier.id } });

      await paniers.updateItem(panier.id, ligne.id, client.id, { quantity: 2 } as never);

      expect(await auPanier(panier.id, o.product.id)).toBe(2);
    });
  });

  // ─── LA REPRISE DE PAIEMENT NE DOIT RIEN DOUBLER ────────────────

  /**
   * DEUX BIÈRES NE DOIVENT PAS DEVENIR QUATRE.
   *
   * L'écran de paiement synchronisait le panier avec `addItem`, qui
   * INCRÉMENTE : à chaque tentative il créait le panier — et `POST /carts`
   * réutilise celui déjà OUVERT — puis renvoyait chaque ligne. Une tentative
   * qui échouait APRÈS cette étape (Stripe, points de fidélité, réseau)
   * laissait le panier en place, et la suivante additionnait les mêmes
   * quantités. Le client payait quatre bières, et son écran affichait
   * toujours deux.
   *
   * Sur une VRAIE base, parce que c'est l'état réellement écrit qui est en
   * cause.
   */
  describe('remplacer le contenu du panier', () => {
    it('REJOUER la même demande ne change rien — l’idempotence', async () => {
      const { o, client, panier } = await decor(50);

      const voulu = { items: [{ productId: o.product.id, quantity: 2 }] };
      await paniers.remplacerLesArticles(panier.id, client.id, voulu as never);
      expect(await auPanier(panier.id, o.product.id)).toBe(2);

      // La tentative a échoué après l'ajout ; le client réessaie.
      await paniers.remplacerLesArticles(panier.id, client.id, voulu as never);
      await paniers.remplacerLesArticles(panier.id, client.id, voulu as never);

      // Toujours deux. C'est tout l'objet de la route.
      expect(await auPanier(panier.id, o.product.id)).toBe(2);
    });

    /**
     * ET VOICI CE QUE FAISAIT L'ANCIEN CHEMIN, mesuré pour qu'on n'ait pas à
     * le croire. `addItem` reste juste — pour un bouton « + ». Il ne l'était
     * pas pour synchroniser.
     */
    it('`addItem` rejoué DOUBLE — ce pourquoi la route existe', async () => {
      const { o, client, panier } = await decor(50);

      const ajout = { productId: o.product.id, quantity: 2 };
      await paniers.addItem(panier.id, client.id, ajout as never);
      await paniers.addItem(panier.id, client.id, ajout as never);

      expect(await auPanier(panier.id, o.product.id)).toBe(4);
    });

    it('RETIRE une ligne que le client a enlevée de son panier', async () => {
      const { o, client, panier } = await decor(50);

      await paniers.remplacerLesArticles(panier.id, client.id, {
        items: [{ productId: o.product.id, quantity: 3 }],
      } as never);
      expect(await auPanier(panier.id, o.product.id)).toBe(3);

      // Un second produit de la même buvette, puis une demande qui ne porte
      // que celui-là : le premier doit disparaître.
      const autre = await s.prisma.product.create({
        data: {
          supplierId: o.supplier.id,
          categoryId: o.product.categoryId,
          name: 'Autre produit',
          price: 300,
        },
      });
      await s.prisma.stock.create({
        data: {
          productId: autre.id,
          supplierId: o.supplier.id,
          pickupPointId: o.pickup.id,
          quantity: 50,
        },
      });

      await paniers.remplacerLesArticles(panier.id, client.id, {
        items: [{ productId: autre.id, quantity: 1 }],
      } as never);

      expect(await auPanier(panier.id, o.product.id)).toBe(0);
      expect(await auPanier(panier.id, autre.id)).toBe(1);
    });

    /**
     * UN PANIER À MOITIÉ REMPLACÉ serait pire que pas de remplacement : le
     * client paierait un contenu que personne n'a voulu. On refuse donc avant
     * d'écrire quoi que ce soit.
     */
    it('n’écrit RIEN quand une ligne dépasse le stock', async () => {
      const { o, client, panier } = await decor(3);

      await paniers.remplacerLesArticles(panier.id, client.id, {
        items: [{ productId: o.product.id, quantity: 2 }],
      } as never);

      await expect(
        paniers.remplacerLesArticles(panier.id, client.id, {
          items: [{ productId: o.product.id, quantity: 10 }],
        } as never),
      ).rejects.toThrow(/reste que 3/);

      // Les deux d'origine sont intacts.
      expect(await auPanier(panier.id, o.product.id)).toBe(2);
    });
  });
});
