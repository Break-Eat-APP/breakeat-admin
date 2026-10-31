import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import {
  CartStatus,
  EventStatus,
  ProductStatus,
  SlotStatus,
  StripeAccountStatus, OrgStatus } from '@prisma/client';
import { CartService } from './cart.service';
import { SlotsService } from '../slots/slots.service';
import { PrismaService } from '../../database/prisma.service';
import { StripeService } from '../payments/stripe.service';
import { GroupsService } from '../groups/groups.service';
import { loyaltyDisabledProvider } from '../loyalty/loyalty.mock';
import { LoyaltyService, LOYALTY_DISABLED } from '../loyalty/loyalty.service';

const USER_ID = 'user-1';
const EVENT_ID = 'event-1';
const VENUE_ID = 'venue-1';
const SUPPLIER_ID = 'supplier-1';
const ORG_ID = 'org-1';
const PICKUP_POINT_ID = 'pp-1';
const PRODUCT_ID = 'product-1';
const CART_ID = 'cart-1';
const ITEM_ID = 'item-1';

function mockEvent() {
  return { id: EVENT_ID, venueId: VENUE_ID, status: EventStatus.ACTIVE };
}
function mockEventSupplier() {
  return { eventId: EVENT_ID, supplierId: SUPPLIER_ID };
}
function mockPickup(supplierId: string | null = null) {
  return {
    id: PICKUP_POINT_ID,
    venueId: VENUE_ID,
    eventId: null,
    supplierId,
  };
}
function mockCart(
  overrides: Partial<{
    status: CartStatus;
    pickupPointId: string | null;
    paymentIntentId: string | null;
    orderGroupId: string | null;
  }> = {},
) {
  return {
    id: CART_ID,
    userId: USER_ID,
    eventId: EVENT_ID,
    supplierId: SUPPLIER_ID,
    pickupPointId: PICKUP_POINT_ID,
    status: CartStatus.OPEN,
    paymentIntentId: null as string | null,
    orderGroupId: null as string | null,
    expiresAt: new Date(Date.now() + 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    // Phase 20 — computeView lit le lieu (config fidélité) et l'org (solde)
    // via la relation `event`, obligatoire côté Prisma.
    redeemedPoints: 0,
    event: { venueId: VENUE_ID, organizationId: ORG_ID },
    ...overrides,
  };
}
function mockProduct() {
  return {
    id: PRODUCT_ID,
    supplierId: SUPPLIER_ID,
    name: 'Burger',
    price: 800,
    status: ProductStatus.ACTIVE,
    availableFrom: null as Date | null,
    availableUntil: null as Date | null,
  };
}
function mockStock(quantity = 50) {
  return { id: 'stock-1', productId: PRODUCT_ID, pickupPointId: null, quantity, isAvailable: true };
}

describe('CartService', () => {
  let service: CartService;
  let prisma: jest.Mocked<PrismaService>;
  let groups: { canAccessEvent: jest.Mock };
  let module: TestingModule;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      providers: [
        CartService,
        loyaltyDisabledProvider,
        {
          // Le paiement remplit desormais le creneau choisi (phase 23).
          // Les cas testes ici partent d’un panier SANS creneau : le service
          // n’est jamais sollicite, un mock vide suffit a l’injection.
          provide: SlotsService,
          useValue: { assignOrderToSlot: jest.fn() },
        },
        {
          provide: PrismaService,
          useValue: {
            event: { findUnique: jest.fn() },
            // UN LIEU PASSE A FLAIX ne prend plus de commande Break Eat.
            // Par defaut le lieu N'EST PAS bascule : ces tests jugent le
            // parcours Break Eat, et la regle Flaix a ses propres cas.
            venue: {
              findUnique: jest
                .fn()
                .mockResolvedValue({ flaixEnabled: false, events: [] }),
            },
            eventSupplier: { findFirst: jest.fn() },
            pickupPoint: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
            cart: {
              findFirst: jest.fn(),
              findUnique: jest.fn(),
              create: jest.fn(),
              update: jest.fn(),
            },
            cartItem: {
              findFirst: jest.fn(),
              upsert: jest.fn(),
              update: jest.fn(),
              deleteMany: jest.fn(),
            },
            product: { findUnique: jest.fn() },
            stock: { findFirst: jest.fn() },
            // Buvette OUVERTE par defaut : une buvette fermee ne prend plus de
            // commande, et chaque test de creation partirait sinon en erreur.
            // Le compte encaisseur est celui du CLUB : la buvette ne fournit
            // plus que son nom, son etat et l'organisation dont elle depend.
            slot: { findUnique: jest.fn() },
            organization: {
              findUnique: jest.fn().mockResolvedValue({
                // `status` : un club SUSPENDU ne prend plus de commande (le
                // statut n'était lu nulle part avant le 18/09/2026).
                status: OrgStatus.ACTIVE,
                stripeAccountId: 'acct_club',
                stripeAccountStatus: StripeAccountStatus.ACTIVE,
              }),
            },
            supplier: {
              findUnique: jest.fn().mockResolvedValue({
                name: 'Buvette Nord',
                status: 'OPEN',
                organizationId: ORG_ID,
              }),
            },
            // checkout freezes prices via $transaction([update, update, …])
            $transaction: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: StripeService,
          useValue: {
            createHostedCheckout: jest.fn(),
            createPaymentIntent: jest.fn().mockResolvedValue({
              id: 'pi_natif',
              client_secret: 'pi_natif_secret_xyz',
            }),
            retrievePaymentIntent: jest.fn(),
          },
        },
        {
          // La clé publiable décide du chemin de paiement : avec elle, l'app
          // ouvre sa propre feuille ; sans elle, on retombe sur la page
          // hébergée. Les tests ci-dessous jouent les deux cas, donc le mock
          // doit distinguer les clés au lieu de tout confondre.
          provide: ConfigService,
          useValue: {
            get: (cle: string) =>
              cle === 'app.stripe.publishableKey' ? 'pk_test_123' : 'https://app.breakeat.test',
          },
        },
        {
          provide: GroupsService,
          // Phase 14.4 — default: every event is accessible. Individual tests
          // can override canAccessEvent to exercise the PRIVATE-event gate.
          useValue: {
            canAccessEvent: jest.fn().mockResolvedValue(true),
          },
        },
      ],
    }).compile();

    service = module.get(CartService);
    prisma = module.get(PrismaService);
    groups = module.get(GroupsService);
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('creates a cart with valid event + supplier + pickup point', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.eventSupplier.findFirst as jest.Mock).mockResolvedValue(mockEventSupplier());
      (prisma.pickupPoint.findUnique as jest.Mock).mockResolvedValue(mockPickup());
      (prisma.cart.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.cart.create as jest.Mock).mockResolvedValue(mockCart());
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({ ...mockCart(), items: [] });

      const result = await service.create(USER_ID, {
        eventId: EVENT_ID,
        supplierId: SUPPLIER_ID,
        pickupPointId: PICKUP_POINT_ID,
      });

      expect(result.id).toBe(CART_ID);
      expect(result.subtotalCents).toBe(0);
      expect(result.totalCents).toBe(0);
    });

    it('rejects when event is not ACTIVE', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue({
        ...mockEvent(),
        status: EventStatus.PAUSED,
      });

      await expect(
        service.create(USER_ID, { eventId: EVENT_ID, supplierId: SUPPLIER_ID }),
      ).rejects.toThrow(BadRequestException);
    });

    // ─── Un lieu passé à Flaix ────────────────────────────────

    /**
     * UNE SEULE RÈGLE, PARTAGÉE — `modeDeCommande`.
     *
     * Elle était écrite à trois endroits qui ne disaient pas la même chose.
     * Résultat, les deux travers opposés tombaient sur un club en pleine
     * configuration : un lieu basculé sans lien utilisable n'avait PLUS
     * AUCUN bouton, et une vieille adresse laissée sur un match terminé
     * suffisait à refuser un panier.
     *
     * Les quatre cas qui comptent sont ici.
     */
    const HEURE = 3_600_000;
    const matchFlaix = (over: Record<string, unknown> = {}) => ({
      id: 'm-1',
      name: 'Match',
      startAt: new Date(Date.now() - HEURE),
      endAt: new Date(Date.now() + 2 * HEURE),
      status: 'ACTIVE',
      isPermanentContainer: false,
      flaixOrderUrl: 'https://commande.flaix.bo.synertic.net/c/m1',
      ...over,
    });
    // Le garde lit le lieu À TRAVERS l'événement — une seule requête, et le
    // MÊME code à l'ouverture du panier et au paiement. Avant, chacun des
    // deux chemins avait la sienne, et seul l'un des deux refusait.
    const lieuAvec = (events: unknown[]) =>
      (prisma.event.findUnique as jest.Mock).mockResolvedValue({
        ...mockEvent(),
        venue: {
          flaixEnabled: true,
          ordersOpenAt: '08:00',
          timezone: 'Europe/Paris',
          events,
        },
      });
    const ouvrirPanier = () =>
      service.create(USER_ID, { eventId: EVENT_ID, supplierId: SUPPLIER_ID });

    it('REFUSE quand un match est ouvert chez Flaix MAINTENANT', async () => {
      lieuAvec([matchFlaix()]);

      await expect(ouvrirPanier()).rejects.toThrow(/Flaix/);
    });

    /**
     * Une ouverture est RÉELLEMENT prévue : le lieu est bien passé à Flaix,
     * il est fermé en attendant. Surtout pas rabattu sur Break Eat, qui
     * vendrait une carte que le club ne tient plus.
     */
    it('REFUSE quand la commande Flaix ouvre plus tard', async () => {
      lieuAvec([
        matchFlaix({
          startAt: new Date(Date.now() + 10 * 86_400_000),
          endAt: new Date(Date.now() + 10 * 86_400_000 + 2 * HEURE),
        }),
      ]);

      await expect(ouvrirPanier()).rejects.toThrow(/Flaix/);
    });

    /**
     * LE REPLI. Un club qui n'a pas fini sa bascule — basculé, aucun lien
     * collé — doit pouvoir continuer à vendre. Sans cela, il arrive au
     * soir du match sans aucun moyen de prendre une commande.
     */
    it('LAISSE PASSER un lieu basculé dont AUCUN match n’a de lien', async () => {
      lieuAvec([matchFlaix({ flaixOrderUrl: null })]);
      (prisma.eventSupplier.findFirst as jest.Mock).mockResolvedValue({ id: 'es-1' });

      await expect(ouvrirPanier()).rejects.not.toThrow(/Flaix/);
    });

    /**
     * ET LE CAS QUI COUPAIT LA VENTE : une vieille adresse laissée sur un
     * match joué il y a six mois. Elle ne joint plus rien, et ne doit donc
     * rien fermer.
     */
    it('LAISSE PASSER quand le seul lien est sur un match TERMINÉ', async () => {
      lieuAvec([
        matchFlaix({
          startAt: new Date(Date.now() - 180 * 86_400_000),
          endAt: new Date(Date.now() - 180 * 86_400_000 + 2 * HEURE),
          status: 'ENDED',
        }),
      ]);
      (prisma.eventSupplier.findFirst as jest.Mock).mockResolvedValue({ id: 'es-1' });

      await expect(ouvrirPanier()).rejects.not.toThrow(/Flaix/);
    });
    it('rejects when supplier is not attached to the event', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.eventSupplier.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(USER_ID, { eventId: EVENT_ID, supplierId: SUPPLIER_ID }),
      ).rejects.toThrow(BadRequestException);
    });

    it('REUTILISE un panier deja ouvert au lieu de bloquer le client', async () => {
      // Le code levait un conflit ici, alors que son propre commentaire disait
      // « reuse ». Un client dont le paiement echouait restait bloque 30 min
      // sur « Un panier est deja ouvert », sans pouvoir ni le reprendre ni en
      // ouvrir un autre.
      //
      // Un panier ouvert sur le MEME evenement et la MEME buvette est
      // exactement celui qu'il veut reprendre.
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.eventSupplier.findFirst as jest.Mock).mockResolvedValue(mockEventSupplier());
      (prisma.cart.findFirst as jest.Mock).mockResolvedValue(mockCart());
      (prisma.cart.update as jest.Mock).mockResolvedValue(mockCart());
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({
        ...mockCart(),
        items: [],
        event: mockEvent(),
      });

      await service.create(USER_ID, { eventId: EVENT_ID, supplierId: SUPPLIER_ID });

      // Aucun panier neuf : on reprend l'existant et on repousse son echeance.
      expect(prisma.cart.create).not.toHaveBeenCalled();
      expect(prisma.cart.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: mockCart().id } }),
      );
    });

    it('rejects with 404 when the event is PRIVATE and the caller is not a member (Phase 14.4)', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent());
      // Non-member: gate denies access → identical 404 to a missing event.
      groups.canAccessEvent.mockResolvedValue(false);

      await expect(
        service.create(USER_ID, { eventId: EVENT_ID, supplierId: SUPPLIER_ID }),
      ).rejects.toThrow(NotFoundException);
      // The access gate runs before the supplier lookup — nothing leaks.
      expect(prisma.eventSupplier.findFirst).not.toHaveBeenCalled();
    });
  });

  // ─── addItem ─────────────────────────────────────────────────

    it('refuse une buvette FERMÉE — le bouton de l’opératrice doit avoir un effet', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.eventSupplier.findFirst as jest.Mock).mockResolvedValue(mockEventSupplier());
      (prisma.supplier.findUnique as jest.Mock).mockResolvedValue({
        name: 'Buvette Sud',
        status: 'CLOSED',
      });

      await expect(
        service.create(USER_ID, { eventId: EVENT_ID, supplierId: SUPPLIER_ID }),
      ).rejects.toThrow(/fermée/);
    });

    it('refuse un club SUSPENDU, et le dit au client sans parler de suspension', async () => {
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        status: OrgStatus.SUSPENDED,
      });

      await expect(
        service.create(USER_ID, { eventId: EVENT_ID, supplierId: SUPPLIER_ID }),
      ).rejects.toThrow(/ne prend pas de commande/);
    });

    it('choisit le comptoir de la buvette quand le client n’en désigne aucun', async () => {
      // L'app ne demande jamais de comptoir : le client a deja choisi sa buvette.
      // Sans ce repli, chaque commande echouait au paiement — « aucun point de
      // retrait » — alors que le club en avait bien cree un.
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.eventSupplier.findFirst as jest.Mock).mockResolvedValue(mockEventSupplier());
      (prisma.pickupPoint.findFirst as jest.Mock).mockResolvedValue({ id: PICKUP_POINT_ID });
      (prisma.cart.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.cart.create as jest.Mock).mockResolvedValue(mockCart());
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({ ...mockCart(), items: [] });

      await service.create(USER_ID, { eventId: EVENT_ID, supplierId: SUPPLIER_ID });

      expect((prisma.cart.create as jest.Mock).mock.calls[0][0].data.pickupPointId).toBe(
        PICKUP_POINT_ID,
      );
    });

  // ─── remplacerLesArticles — l'idempotence du panier ────────────

  /**
   * DEUX BIÈRES NE DOIVENT PAS DEVENIR QUATRE.
   *
   * L'écran de paiement synchronisait le panier avec `addItem`, qui
   * INCRÉMENTE : à chaque tentative il créait le panier (donc réutilisait
   * celui déjà ouvert) puis renvoyait chaque ligne. Une tentative qui
   * échouait APRÈS l'ajout — Stripe, points de fidélité, réseau — laissait le
   * panier ouvert, et la suivante additionnait les mêmes quantités. Le client
   * payait quatre bières, et son écran affichait toujours deux.
   */
  describe('remplacerLesArticles', () => {
    /** Un panier ouvert, un produit commandable, du stock. */
    function panierPret() {
      // `items` est là pour `computeView`, qui relit le panier à la fin et
      // rend la vue au client. Le même double sert à `requireOwnership`.
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({ ...mockCart(), items: [] });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct());
      (prisma.stock.findFirst as jest.Mock).mockResolvedValue(mockStock(50));
      // La forme INTERACTIVE : le remplacement a besoin d'un client
      // transactionnel pour retirer puis reposer les lignes ensemble.
      const tx = {
        cartItem: { deleteMany: jest.fn(), upsert: jest.fn() },
        cart: { update: jest.fn() },
      };
      (prisma.$transaction as jest.Mock).mockImplementation(
        async (cb: (c: unknown) => unknown) => cb(tx),
      );
      return tx;
    }

    /**
     * LE TEST QUI DÉFINIT LA ROUTE. `set`, jamais `increment` — appeler deux
     * fois doit donner le même panier.
     */
    it('pose une quantité ABSOLUE, et non un ajout', async () => {
      const tx = panierPret();

      await service.remplacerLesArticles(CART_ID, USER_ID, {
        items: [{ productId: PRODUCT_ID, quantity: 2 }],
      });
      await service.remplacerLesArticles(CART_ID, USER_ID, {
        items: [{ productId: PRODUCT_ID, quantity: 2 }],
      });

      for (const appel of tx.cartItem.upsert.mock.calls) {
        expect(appel[0].update).toEqual({ quantity: 2 });
        // `increment` est exactement ce qui faisait doubler.
        expect(JSON.stringify(appel[0].update)).not.toContain('increment');
      }
    });

    /**
     * CE QUI N'EST PAS ENVOYÉ EST RETIRÉ. C'est tout l'intérêt d'un
     * remplacement : un client qui enlève une bière de son panier doit la voir
     * disparaître du panier serveur aussi.
     */
    it('RETIRE les lignes absentes de la demande', async () => {
      const tx = panierPret();

      await service.remplacerLesArticles(CART_ID, USER_ID, {
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
      });

      expect(tx.cartItem.deleteMany).toHaveBeenCalledWith({
        where: { cartId: CART_ID, productId: { notIn: [PRODUCT_ID] } },
      });
    });

    /**
     * Deux lignes du même produit rendraient le résultat dépendant de l'ordre
     * d'application — exactement l'ambiguïté qu'on vient de supprimer.
     */
    it('REFUSE deux lignes du même produit', async () => {
      panierPret();

      await expect(
        service.remplacerLesArticles(CART_ID, USER_ID, {
          items: [
            { productId: PRODUCT_ID, quantity: 1 },
            { productId: PRODUCT_ID, quantity: 3 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    /**
     * ON REFUSE AVANT D'ÉCRIRE QUOI QUE CE SOIT. Un panier à moitié remplacé
     * serait pire que pas de remplacement : le client paierait un contenu que
     * personne n'a voulu.
     */
    it('n’écrit RIEN quand le stock manque', async () => {
      const tx = panierPret();
      (prisma.stock.findFirst as jest.Mock).mockResolvedValue(mockStock(1));

      await expect(
        service.remplacerLesArticles(CART_ID, USER_ID, {
          items: [{ productId: PRODUCT_ID, quantity: 5 }],
        }),
      ).rejects.toThrow(BadRequestException);

      expect(tx.cartItem.upsert).not.toHaveBeenCalled();
      expect(tx.cartItem.deleteMany).not.toHaveBeenCalled();
    });

    it('refuse un panier qui n’est pas le sien', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({
        ...mockCart(),
        userId: 'quelqu-un-d-autre',
      });

      await expect(
        service.remplacerLesArticles(CART_ID, USER_ID, {
          items: [{ productId: PRODUCT_ID, quantity: 1 }],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    /** Chaque geste du client repousse l'échéance — comme `addItem`. */
    it('repousse la péremption du panier', async () => {
      const tx = panierPret();

      await service.remplacerLesArticles(CART_ID, USER_ID, {
        items: [{ productId: PRODUCT_ID, quantity: 1 }],
      });

      expect(tx.cart.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: CART_ID },
          data: { expiresAt: expect.any(Date) },
        }),
      );
    });
  });

  describe('addItem', () => {
    it('rejects when caller does not own the cart', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({
        ...mockCart(),
        userId: 'someone-else',
      });

      await expect(
        service.addItem(CART_ID, USER_ID, { productId: PRODUCT_ID, quantity: 1 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects items belonging to a different supplier', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(mockCart());
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        ...mockProduct(),
        supplierId: 'supplier-2',
      });

      await expect(
        service.addItem(CART_ID, USER_ID, { productId: PRODUCT_ID, quantity: 1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects when product is not ACTIVE', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(mockCart());
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        ...mockProduct(),
        status: ProductStatus.OUT_OF_STOCK,
      });

      await expect(
        service.addItem(CART_ID, USER_ID, { productId: PRODUCT_ID, quantity: 1 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── checkout ────────────────────────────────────────────────

  describe('choisirCreneau — le creneau doit ARRIVER au serveur', () => {
    it('enregistre un créneau du bon événement', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(mockCart());
      (prisma.slot.findUnique as jest.Mock).mockResolvedValue({
        eventId: EVENT_ID,
        status: SlotStatus.OPEN,
        supplierId: null,
      });

      await service.choisirCreneau(CART_ID, USER_ID, 'slot-1');

      expect(prisma.cart.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ selectedSlotId: 'slot-1' }),
        }),
      );
    });

    it('refuse un créneau d’un AUTRE événement', async () => {
      // Sans ce controle, on reserverait une place chez un autre club.
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(mockCart());
      (prisma.slot.findUnique as jest.Mock).mockResolvedValue({
        eventId: 'autre-evenement',
        status: SlotStatus.OPEN,
        supplierId: null,
      });

      await expect(service.choisirCreneau(CART_ID, USER_ID, 'slot-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('refuse le créneau d’une AUTRE buvette', async () => {
      // « Mi-temps » au comptoir Sud pour une commande passee au Nord : le
      // client se presenterait devant un stand qui n'attend rien.
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(mockCart());
      (prisma.slot.findUnique as jest.Mock).mockResolvedValue({
        eventId: EVENT_ID,
        status: SlotStatus.OPEN,
        supplierId: 'autre-buvette',
      });

      await expect(service.choisirCreneau(CART_ID, USER_ID, 'slot-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('accepte null — le client renonce à une heure précise', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(mockCart());

      await service.choisirCreneau(CART_ID, USER_ID, null);

      expect(prisma.cart.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ selectedSlotId: null }),
        }),
      );
      // Aucun creneau a verifier : on n'interroge pas la base pour rien.
      expect(prisma.slot.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('checkout', () => {
    function setupValidCheckout() {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({
        ...mockCart(),
        items: [
          { id: ITEM_ID, productId: PRODUCT_ID, quantity: 2, product: mockProduct() },
        ],
      });
      (prisma.supplier.findUnique as jest.Mock).mockResolvedValue({
        id: SUPPLIER_ID,
        stripeAccountId: 'acct_test',
        stripeAccountStatus: StripeAccountStatus.ACTIVE,
      });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct());
      (prisma.stock.findFirst as jest.Mock).mockResolvedValue(mockStock(50));
    }

    // ─── Ce que le paiement doit refuser AVANT d'encaisser ────

    /**
     * LE STOCK N'ÉTAIT VÉRIFIÉ QU'À L'AJOUT.
     *
     * Entre le moment où le client coche sa bière et celui où il paie, un
     * autre peut avoir pris la dernière. Le paiement passait, et
     * `decrementerStock` — qui ne refuse jamais rien, l'argent étant déjà
     * encaissé — ne faisait que CONSTATER. Le client payait pour un
     * article que personne ne lui servirait.
     *
     * Ici, refuser ne coûte qu'un message : rien n'a été débité.
     */
    it('REFUSE quand le stock est passé sous la quantité du panier', async () => {
      setupValidCheckout();
      // Deux exemplaires au panier, il n'en reste qu'un.
      (prisma.stock.findFirst as jest.Mock).mockResolvedValue(mockStock(1));

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    /**
     * `expiresAt` était ÉCRIT et jamais lu ; le statut `EXPIRED` existait
     * sans que rien ne le pose. Un panier d'avant-hier pouvait encore
     * partir au paiement, avec les prix et les stocks d'avant-hier.
     */
    it('REFUSE un panier périmé, et le marque EXPIRED', async () => {
      setupValidCheckout();
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({
        ...mockCart(),
        expiresAt: new Date(Date.now() - 1_000),
        items: [{ id: ITEM_ID, productId: PRODUCT_ID, quantity: 2, product: mockProduct() }],
      });

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow(/expiré/);
      expect(prisma.cart.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: CartStatus.EXPIRED }),
        }),
      );
    });

    /**
     * LE GARDE FLAIX NE VIVAIT QU'À L'OUVERTURE DU PANIER.
     *
     * Un client ouvre son panier à 20h00, le club bascule à 20h02, le
     * paiement part à 20h04 : Break Eat encaissait pour une carte que le club
     * ne tient plus, et la commande tombait dans un comptoir que personne ne
     * regarde — le personnel est passé sur Flaix. Les cinq minutes de
     * péremption bornent la fenêtre, elles ne la ferment pas.
     *
     * Ici, refuser ne coûte qu'un message : rien n'a été débité.
     */
    it('REFUSE de payer un panier dont le lieu est passé à Flaix', async () => {
      setupValidCheckout();
      (prisma.event.findUnique as jest.Mock).mockResolvedValue({
        ...mockEvent(),
        venue: {
          flaixEnabled: true,
          ordersOpenAt: '08:00',
          timezone: 'Europe/Paris',
          events: [
            {
              id: 'm-1',
              name: 'Match',
              startAt: new Date(Date.now() - 3_600_000),
              endAt: new Date(Date.now() + 2 * 3_600_000),
              status: 'ACTIVE',
              isPermanentContainer: false,
              flaixOrderUrl: 'https://commande.flaix.bo.synertic.net/c/m1',
            },
          ],
        },
      });

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow(/Flaix/);
    });

    /**
     * ET LE REPLI TIENT AUSSI AU PAIEMENT. Un club basculé dont aucun match
     * ne porte de lien garde son parcours Break Eat : refuser ici le
     * priverait de sa vente du soir, alors qu'il n'a rien pour la prendre
     * ailleurs.
     */
    it('LAISSE PAYER un lieu basculé dont AUCUN match n’a de lien', async () => {
      setupValidCheckout();
      (prisma.event.findUnique as jest.Mock).mockResolvedValue({
        ...mockEvent(),
        venue: {
          flaixEnabled: true,
          ordersOpenAt: '08:00',
          timezone: 'Europe/Paris',
          events: [
            {
              id: 'm-1',
              name: 'Match',
              startAt: new Date(Date.now() - 3_600_000),
              endAt: new Date(Date.now() + 2 * 3_600_000),
              status: 'ACTIVE',
              isPermanentContainer: false,
              flaixOrderUrl: null,
            },
          ],
        },
      });

      await expect(service.checkout(CART_ID, USER_ID)).rejects.not.toThrow(/Flaix/);
    });

    /**
     * UN PAIEMENT DÉJÀ ENGAGÉ NE S'EXPIRE PAS. Couper pendant une
     * authentification bancaire encaisserait l'argent sans créer la
     * commande — le pire des deux mondes.
     */
    it('n’expire PAS un panier dont le paiement est engagé', async () => {
      setupValidCheckout();
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({
        ...mockCart(),
        status: CartStatus.CHECKOUT_PENDING,
        expiresAt: new Date(Date.now() - 60_000),
        items: [{ id: ITEM_ID, productId: PRODUCT_ID, quantity: 2, product: mockProduct() }],
      });
      const stripe = (service as unknown as { stripe: { createHostedCheckout: jest.Mock } }).stripe;
      stripe.createHostedCheckout.mockResolvedValue({
        id: 'cs_test',
        url: 'https://stripe/pay/cs_test',
        payment_intent: 'pi_test',
      });

      await expect(service.checkout(CART_ID, USER_ID)).resolves.toBeDefined();
    });

    it('ouvre une page Stripe et engage le panier', async () => {
      setupValidCheckout();
      const stripe = (service as unknown as { stripe: { createHostedCheckout: jest.Mock } }).stripe;
      stripe.createHostedCheckout.mockResolvedValue({
        id: 'cs_test',
        url: 'https://stripe/pay/cs_test',
        payment_intent: 'pi_test',
      });

      const result = await service.checkout(CART_ID, USER_ID);

      expect(result.checkoutUrl).toBe('https://stripe/pay/cs_test');
      expect(result.amountCents).toBe(1600);
      // `cartId` dans les métadonnées est ce qui relie le paiement à la
      // commande : le webhook le lit pour créer l'Order. Sans lui, on
      // encaisserait sans que rien n'arrive en cuisine.
      expect(stripe.createHostedCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: `cart_${CART_ID}`,
          destinationAccountId: 'acct_club',
          captureMethod: 'automatic',
          metadata: expect.objectContaining({ cartId: CART_ID }),
        }),
      );
    });

    it('RÉSERVE les points AVANT d’appeler Stripe', async () => {
      // Le défaut : les points étaient débités à la création de la commande,
      // donc après le paiement. S'ils avaient été dépensés entre-temps, la
      // commande échouait alors que la carte était débitée. Réservés ici, le
      // refus arrive avant le paiement — et ne coûte qu'un message.
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({
        ...mockCart(),
        redeemedPoints: 100,
        items: [{ id: ITEM_ID, productId: PRODUCT_ID, quantity: 2, product: mockProduct() }],
      });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue(mockProduct());
      (prisma.stock.findFirst as jest.Mock).mockResolvedValue(mockStock(50));
      (prisma.event.findUnique as jest.Mock).mockResolvedValue({ organizationId: ORG_ID });

      const fidelite = module.get(LoyaltyService) as unknown as {
        getConfigForVenue: jest.Mock;
        getBalance: jest.Mock;
        discountForPoints: jest.Mock;
        holdForCart: jest.Mock;
      };
      fidelite.getConfigForVenue.mockResolvedValue({
        enabled: true,
        pointsPerEuro: 1,
        pointValueCents: 1,
      });
      fidelite.getBalance.mockResolvedValue(100);
      fidelite.discountForPoints.mockReturnValue({ pointsUsed: 100, discountCents: 100 });

      const stripe = (service as unknown as { stripe: { createHostedCheckout: jest.Mock } }).stripe;
      stripe.createHostedCheckout.mockResolvedValue({
        id: 'cs_test',
        url: 'https://stripe/pay/cs_test',
        payment_intent: 'pi_test',
      });

      await service.checkout(CART_ID, USER_ID, 'web');

      expect(fidelite.holdForCart).toHaveBeenCalledWith({
        cartId: CART_ID,
        userId: USER_ID,
        organizationId: ORG_ID,
        points: 100,
      });
      // L'ordre est le fond du sujet : réserver après avoir annoncé le montant
      // à Stripe ne protégerait de rien.
      expect(fidelite.holdForCart.mock.invocationCallOrder[0]).toBeLessThan(
        stripe.createHostedCheckout.mock.invocationCallOrder[0],
      );

      // La doublure est partagée par tout ce fichier : on la repose désactivée.
      fidelite.getConfigForVenue.mockResolvedValue(LOYALTY_DISABLED);
      fidelite.getBalance.mockResolvedValue(0);
      fidelite.discountForPoints.mockReturnValue({ pointsUsed: 0, discountCents: 0 });
    });

    it('renvoie le client du WEB sur le site, sans passer par le pont', async () => {
      // Le pont ne sert qu'a traduire une adresse http en `breakeat://` pour
      // l'application installee. Sur le web il n'ajoutait qu'une redirection --
      // et une dependance a PUBLIC_API_URL, dont l'absence renvoyait le client
      // sur `localhost` apres avoir paye.
      setupValidCheckout();
      const stripe = (service as unknown as { stripe: { createHostedCheckout: jest.Mock } }).stripe;
      stripe.createHostedCheckout.mockResolvedValue({
        id: 'cs_test',
        url: 'https://stripe/pay/cs_test',
        payment_intent: 'pi_test',
      });

      await service.checkout(CART_ID, USER_ID, 'web');

      const args = stripe.createHostedCheckout.mock.calls[0][0];
      expect(args.successUrl).toContain('/commandes?paye=1');
      expect(args.successUrl).not.toContain('/paiement/retour');
      expect(args.cancelUrl).toContain('/panier?annule=1');
    });

    it('paie EN NATIF sur telephone : aucune page, aucune sortie de l’app', async () => {
      // L'exigence tenue ici : sur telephone, le client ne sort pas de
      // l'application pour payer. Pas d'adresse a ouvrir, donc pas de
      // navigateur, donc pas de retour a negocier.
      setupValidCheckout();
      const stripe = (
        service as unknown as {
          stripe: { createPaymentIntent: jest.Mock; createHostedCheckout: jest.Mock };
        }
      ).stripe;

      const reponse = await service.checkout(CART_ID, USER_ID, 'native');

      expect(reponse.mode).toBe('natif');
      expect(reponse.clientSecret).toBe('pi_natif_secret_xyz');
      expect(reponse.publishableKey).toBe('pk_test_123');
      expect(reponse.checkoutUrl).toBeUndefined();
      expect(stripe.createHostedCheckout).not.toHaveBeenCalled();

      // Ce que le webhook lira pour faire naitre la commande. Sans `cartId`
      // dans les metadonnees, l'argent serait encaisse et rien n'arriverait en
      // cuisine — c'est le fil le plus fragile des deux chemins.
      expect(stripe.createPaymentIntent.mock.calls[0][0].metadata.cartId).toBe(CART_ID);
    });

    it('engage le panier de la meme facon par les deux chemins', async () => {
      // Le panier doit finir CHECKOUT_PENDING avec son intention, sinon la
      // commande naitrait differemment selon l'appareil du client.
      setupValidCheckout();

      await service.checkout(CART_ID, USER_ID, 'native');

      const ecritures = (prisma.$transaction as jest.Mock).mock.calls[0][0];
      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: CART_ID },
        data: { status: CartStatus.CHECKOUT_PENDING, paymentIntentId: 'pi_natif' },
      });
      expect(ecritures.length).toBeGreaterThan(0);
    });

    it('sans cle publiable, retombe sur la page hebergee plutot que d’echouer', async () => {
      // Un paiement impossible serait pire qu'un paiement qui sort de l'app :
      // le repli garde le service debout le temps que la cle soit posee.
      const config = (service as unknown as { config: { get: jest.Mock } }).config;
      jest.spyOn(config, 'get').mockImplementation((cle: string) =>
        cle === 'app.stripe.publishableKey' ? '' : 'https://app.breakeat.test',
      );
      setupValidCheckout();
      const stripe = (service as unknown as { stripe: { createHostedCheckout: jest.Mock } }).stripe;
      stripe.createHostedCheckout.mockResolvedValue({
        id: 'cs_test',
        url: 'https://stripe/pay/cs_test',
        payment_intent: 'pi_test',
      });

      const reponse = await service.checkout(CART_ID, USER_ID, 'native');

      expect(reponse.mode).toBe('web');
      // Stripe refuse un schema personnalise : le rebond vers `breakeat://` se
      // fait donc par une page a nous.
      const args = stripe.createHostedCheckout.mock.calls[0][0];
      expect(args.successUrl).toContain('/paiement/retour');
      expect(args.successUrl).toContain('cible=app');
      expect(args.cancelUrl).toContain('etat=annule');
    });

    it('refuse le paiement tant que le CLUB ne peut pas encaisser', async () => {
      // L'argent va au compte du club, jamais a celui d'une buvette : c'est
      // donc son etat a lui qui autorise ou non le paiement.
      setupValidCheckout();
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        stripeAccountId: 'acct_club',
        stripeAccountStatus: StripeAccountStatus.PENDING,
      });

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('refuse le paiement si le club n’est pas relié du tout', async () => {
      setupValidCheckout();
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue({
        stripeAccountId: null,
        stripeAccountStatus: StripeAccountStatus.NOT_ONBOARDED,
      });

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('encaisse sur le compte du CLUB, même si la buvette en porte un ancien', async () => {
      // Les colonnes `stripe*` de Supplier subsistent en base pour l'historique.
      // Les lire de nouveau ferait diverger la recette d'une buvette vers un
      // compte que plus aucun écran n'affiche.
      setupValidCheckout();
      (prisma.supplier.findUnique as jest.Mock).mockResolvedValue({
        name: 'Buvette Nord',
        status: 'OPEN',
        organizationId: ORG_ID,
        stripeAccountId: 'acct_ANCIEN_DE_LA_BUVETTE',
        stripeAccountStatus: StripeAccountStatus.ACTIVE,
      });

      const stripe = (service as unknown as { stripe: { createHostedCheckout: jest.Mock } }).stripe;
      stripe.createHostedCheckout.mockResolvedValue({
        id: 'cs_test',
        url: 'https://stripe/pay/cs_test',
        payment_intent: 'pi_test',
      });

      await service.checkout(CART_ID, USER_ID);

      expect(stripe.createHostedCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ destinationAccountId: 'acct_club' }),
      );
    });

    it('rejects checkout if cart has no pickup point', async () => {
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue(mockCart({ pickupPointId: null }));

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow(BadRequestException);
    });

    it('freezes prices + transitions ONLY after Stripe succeeds, in one transaction (P1 — snapshot timing)', async () => {
      setupValidCheckout();
      const stripe = (service as unknown as { stripe: { createHostedCheckout: jest.Mock } }).stripe;
      stripe.createHostedCheckout.mockResolvedValue({
        id: 'cs_test',
        url: 'https://stripe/pay/cs_test',
        payment_intent: 'pi_test',
      });
      const txSpy = (prisma as unknown as { $transaction: jest.Mock }).$transaction;
      txSpy.mockResolvedValueOnce([]);

      await service.checkout(CART_ID, USER_ID);

      // Stripe MUST be called before the freeze/transition transaction.
      const stripeOrder = stripe.createHostedCheckout.mock.invocationCallOrder[0];
      const txOrder = txSpy.mock.invocationCallOrder[0];
      expect(stripeOrder).toBeLessThan(txOrder);

      // One single transaction carries BOTH the price-snapshot updates AND the
      // CHECKOUT_PENDING status flip — so a cart is never OPEN-with-snapshot.
      expect(txSpy).toHaveBeenCalledTimes(1);
      expect(Array.isArray(txSpy.mock.calls[0][0])).toBe(true);
      expect(prisma.cartItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { priceSnapshotCents: 800 } }),
      );
      expect(prisma.cart.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CartStatus.CHECKOUT_PENDING,
            paymentIntentId: 'pi_test',
          }),
        }),
      );
    });

    it('does NOT freeze prices or transition when Stripe fails — cart stays OPEN with live prices (P1 — snapshot timing)', async () => {
      setupValidCheckout();
      const stripe = (service as unknown as { stripe: { createHostedCheckout: jest.Mock } }).stripe;
      stripe.createHostedCheckout.mockRejectedValue(new Error('stripe unavailable'));
      const txSpy = (prisma as unknown as { $transaction: jest.Mock }).$transaction;

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow('stripe unavailable');

      // No snapshot write, no status flip: the freeze/transition transaction
      // must never run when the PaymentIntent could not be created. The cart
      // therefore stays OPEN, and computeView() re-reads live prices on retry.
      expect(txSpy).not.toHaveBeenCalled();
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
      expect(prisma.cart.update).not.toHaveBeenCalled();
    });

    it('rejects with 403 when the owner lost PRIVATE-event access since cart creation (Phase 14.4)', async () => {
      setupValidCheckout();
      // Membership revoked after the cart was created.
      groups.canAccessEvent.mockResolvedValue(false);

      await expect(service.checkout(CART_ID, USER_ID)).rejects.toThrow(ForbiddenException);
    });

    it('rend LA MÊME page à un client qui revient sur le paiement', async () => {
      setupValidCheckout();
      (prisma.cart.findUnique as jest.Mock).mockResolvedValue({
        ...mockCart({ status: CartStatus.CHECKOUT_PENDING }),
        items: [{ id: ITEM_ID, productId: PRODUCT_ID, quantity: 2, product: mockProduct() }],
      });
      const stripe = (service as unknown as { stripe: { createHostedCheckout: jest.Mock } }).stripe;
      stripe.createHostedCheckout.mockResolvedValue({
        id: 'cs_test',
        url: 'https://stripe/pay/cs_test',
        payment_intent: 'pi_test',
      });

      const result = await service.checkout(CART_ID, USER_ID);

      // Même clé d'idempotence ⇒ Stripe renvoie la session déjà créée. Un
      // client qui revient en arrière ne doit pas ouvrir un second paiement.
      expect(result.checkoutUrl).toBe('https://stripe/pay/cs_test');
      expect(stripe.createHostedCheckout).toHaveBeenCalledWith(
        expect.objectContaining({ idempotencyKey: `cart_${CART_ID}` }),
      );
    });
  });

  it('findOne throws NotFoundException for unknown cart', async () => {
    (prisma.cart.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(service.findOne('bad-id', USER_ID)).rejects.toThrow(NotFoundException);
  });
});

// --- Stock : suivi explicite, pas obligatoire ------------------

describe('CartService — produit sans ligne de stock', () => {
  it('resolveStock renvoie null quand aucune ligne n existe', async () => {
    // Regle : absence de ligne = produit NON SUIVI, donc commandable.
    //
    // L'inverse bloquait tout le parcours : ni la creation d'un produit ni
    // l'assistant de demarrage ne posent de ligne de stock, si bien qu'aucun
    // produit cree normalement n'etait commandable.
    //
    // Ce test fige l'intention. S'il tombe, c'est qu'on est revenu a exiger
    // une ligne de stock — et le parcours de commande sera casse.
    const findFirst = jest.fn().mockResolvedValue(null);
    const faux = { stock: { findFirst } } as unknown as PrismaService;

    const resolve = (
      CartService.prototype as unknown as {
        resolveStock: (this: unknown, p: string, pp: string | null) => Promise<unknown>;
      }
    ).resolveStock;

    const res = await resolve.call({ prisma: faux }, 'prod-1', null);
    expect(res).toBeNull();
  });
});

// --- Le numero rendu a l'app au retour du paiement --------------

describe('CartService — la commande rendue à l’app après paiement', () => {
  it('porte le numéro du jour, et pas seulement la référence longue', async () => {
    // Il était lu en base puis jeté à la construction de la réponse : l'écran
    // de confirmation et la Live Activity n'avaient donc que « BE-00000005 » à
    // montrer, là où le comptoir annonce « 5 ».
    const prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'order-1',
          publicOrderNumber: 'BE-00000005',
          dailyNumber: 5,
          totalCents: 700,
          status: 'PAID',
          slot: null,
          supplierId: SUPPLIER_ID,
        }),
      },
      supplier: { findUnique: jest.fn().mockResolvedValue({ name: 'Buvette', planUrl: null }) },
    } as unknown as PrismaService;

    const reponse = await CartService.prototype.commandeDuPanier.call(
      { prisma, requireOwnership: jest.fn().mockResolvedValue({}) } as never,
      CART_ID,
      USER_ID,
    );

    expect(reponse.order?.dailyNumber).toBe(5);
    expect(reponse.order?.publicOrderNumber).toBe('BE-00000005');
  });
});
