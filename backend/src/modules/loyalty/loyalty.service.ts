import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CartStatus, LoyaltyEntryKind, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/** Configuration du programme telle que définie par le club, sur son lieu. */
export interface LoyaltyConfig {
  enabled: boolean;
  /** Points gagnés par euro dépensé. */
  pointsPerEuro: number;
  /** Valeur d'un point en centimes à l'utilisation. */
  pointValueCents: number;
}

export const LOYALTY_DISABLED: LoyaltyConfig = {
  enabled: false,
  pointsPerEuro: 0,
  pointValueCents: 0,
};

/**
 * Reste à payer minimum, en centimes, après remise fidélité.
 *
 * Stripe refuse les paiements en dessous de 0,50 € (EUR). Une remise qui
 * amènerait la note à 0 — ou à 20 centimes — produirait un panier que l'app
 * affiche comme payable et que le paiement rejette ensuite : le client se
 * retrouverait bloqué au dernier écran sans comprendre pourquoi.
 *
 * On préfère donc plafonner la remise et l'annoncer, plutôt que d'ouvrir une
 * voie « commande gratuite » qui court-circuiterait le paiement. Le jour où
 * payer entièrement en points devient souhaitable, c'est une décision produit
 * à prendre avec le parcours de paiement en face, pas un effet de bord.
 */
export const MIN_PAYABLE_CENTS = 50;

/**
 * LoyaltyService — programme de fidélité (gain + utilisation).
 *
 * Deux portées distinctes, volontairement :
 *  - la CONFIGURATION vit sur le lieu (`Venue.loyalty*`) : c'est le club qui
 *    décide d'activer les points et à quel taux ;
 *  - le SOLDE vit au niveau de l'organisation (`LoyaltyAccount`) : les points
 *    suivent le club, pas un bâtiment, donc un client les conserve d'un
 *    événement à l'autre.
 *
 * Invariants tenus par ce service :
 *  - le solde ne devient jamais négatif ;
 *  - `balance` (cache) et le registre `LoyaltyTransaction` sont écrits dans la
 *    MÊME transaction — jamais l'un sans l'autre ;
 *  - une commande ne peut créditer qu'une fois et débiter qu'une fois
 *    (contrainte d'unicité `(orderId, kind)` → rejeu sans effet).
 */
@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Configuration ──────────────────────────────────────────

  /** Config du programme pour un lieu. Lieu inconnu ⇒ programme désactivé. */
  async getConfigForVenue(venueId: string): Promise<LoyaltyConfig> {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        loyaltyEnabled: true,
        loyaltyPointsPerEuro: true,
        loyaltyPointValueCents: true,
      },
    });
    if (!venue?.loyaltyEnabled) return LOYALTY_DISABLED;
    return {
      enabled: true,
      pointsPerEuro: venue.loyaltyPointsPerEuro,
      pointValueCents: venue.loyaltyPointValueCents,
    };
  }

  /** Config applicable à un événement (via le lieu qui l'accueille). */
  async getConfigForEvent(eventId: string): Promise<LoyaltyConfig> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { venueId: true },
    });
    if (!event) return LOYALTY_DISABLED;
    return this.getConfigForVenue(event.venueId);
  }

  // ─── Solde ──────────────────────────────────────────────────

  /**
   * Solde d'un client chez un club. Ne crée rien : un client qui n'a jamais
   * gagné de point a simplement 0 (pas de ligne inutile en base).
   */
  async getBalance(userId: string, organizationId: string): Promise<number> {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { balance: true },
    });
    return account?.balance ?? 0;
  }

  /** Solde + derniers mouvements, pour l'écran fidélité de l'app. */
  async getSummary(userId: string, organizationId: string) {
    const account = await this.prisma.loyaltyAccount.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: { id: true, kind: true, points: true, createdAt: true, orderId: true },
        },
      },
    });
    return {
      organizationId,
      balance: account?.balance ?? 0,
      transactions: account?.transactions ?? [],
    };
  }

  // ─── Calcul ─────────────────────────────────────────────────

  /**
   * Points gagnés pour un montant payé. Arrondi à l'entier INFÉRIEUR : on ne
   * crédite jamais un point qui n'a pas été entièrement gagné.
   */
  pointsForAmount(totalCents: number, config: LoyaltyConfig): number {
    if (!config.enabled || config.pointsPerEuro <= 0 || totalCents <= 0) return 0;
    return Math.floor((totalCents / 100) * config.pointsPerEuro);
  }

  /**
   * Remise obtenue en dépensant `points`.
   *
   * Deux plafonds, dans cet ordre :
   *  1. la remise ne dépasse jamais la note (pas de note négative) ;
   *  2. il reste toujours au moins {@link MIN_PAYABLE_CENTS} à payer, sans quoi
   *     le paiement rejetterait la commande après coup.
   *
   * Une note déjà inférieure à ce minimum n'accepte donc aucune remise : mieux
   * vaut le dire tout de suite que de laisser espérer une réduction impossible.
   *
   * Renvoie aussi les points RÉELLEMENT consommés — on ne débite jamais plus
   * que ce que la remise a servi.
   *
   * SOURCE UNIQUE de la règle : le panier, la création de commande et l'écran
   * de paiement en dépendent tous. La dupliquer les ferait diverger.
   */
  discountForPoints(
    points: number,
    subtotalCents: number,
    config: LoyaltyConfig,
  ): { pointsUsed: number; discountCents: number } {
    if (!config.enabled || config.pointValueCents <= 0 || points <= 0 || subtotalCents <= 0) {
      return { pointsUsed: 0, discountCents: 0 };
    }

    const remiseMax = subtotalCents - MIN_PAYABLE_CENTS;
    if (remiseMax <= 0) return { pointsUsed: 0, discountCents: 0 };

    const raw = points * config.pointValueCents;
    if (raw <= remiseMax) return { pointsUsed: points, discountCents: raw };

    // Plafonné : on ne consomme que les points nécessaires pour l'atteindre.
    // Arrondi INFÉRIEUR — arrondir au-dessus ferait passer sous le minimum.
    const pointsUsed = Math.floor(remiseMax / config.pointValueCents);
    if (pointsUsed <= 0) return { pointsUsed: 0, discountCents: 0 };
    return { pointsUsed, discountCents: pointsUsed * config.pointValueCents };
  }

  // ─── Mouvements ─────────────────────────────────────────────

  /**
   * Crédite les points d'une commande récupérée.
   *
   * Idempotent : la contrainte `(orderId, EARN)` fait échouer un second appel,
   * qu'on absorbe silencieusement (P2002) — une transition rejouée ne doit pas
   * créditer deux fois.
   */
  async earnForOrder(params: {
    userId: string;
    organizationId: string;
    orderId: string;
    totalCents: number;
    config: LoyaltyConfig;
  }): Promise<number> {
    const points = this.pointsForAmount(params.totalCents, params.config);
    if (points <= 0) return 0;

    try {
      await this.prisma.$transaction(async (tx) => {
        const account = await this.upsertAccount(tx, params.userId, params.organizationId);

        // `increment` plutôt que « lire puis écrire une valeur absolue » : en
        // READ COMMITTED (défaut PostgreSQL), deux crédits simultanés liraient
        // le même solde et le second écraserait le premier — des points perdus
        // sans trace. L'incrément est résolu par la base, jamais par nous.
        const { balance: balanceAfter } = await tx.loyaltyAccount.update({
          where: { id: account.id },
          data: { balance: { increment: points } },
          select: { balance: true },
        });

        // Créé APRÈS l'incrément pour porter le solde réel d'après-coup. Un
        // doublon (orderId, EARN) lève P2002 ici et annule toute la
        // transaction, incrément compris : le rejeu reste sans effet.
        await tx.loyaltyTransaction.create({
          data: {
            accountId: account.id,
            orderId: params.orderId,
            kind: LoyaltyEntryKind.EARN,
            points,
            balanceAfter,
          },
        });
        await tx.order.update({
          where: { id: params.orderId },
          data: { pointsEarned: points },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        // Déjà crédité pour cette commande — rejeu sans effet.
        return 0;
      }
      throw err;
    }

    this.logger.log(`+${points} point(s) pour la commande ${params.orderId}`);
    return points;
  }

  /**
   * RÉSERVE les points d'un panier, AVANT que le client ne paie.
   *
   * Le débit se faisait dans la transaction de création de commande, donc après
   * la confirmation de Stripe. Des points dépensés entre-temps sur une autre
   * commande faisaient échouer cette transaction : carte débitée, aucune
   * commande, et un solde qui ne redevenait pas disponible tout seul. Le webhook
   * rejouait et échouait de la même façon, indéfiniment.
   *
   * Réserver, c'est débiter TOUT DE SUITE et mettre les points de côté. Le refus
   * pour solde insuffisant arrive alors avant le paiement, là où il ne coûte
   * qu'un message — et deux paniers du même client ne peuvent plus dépenser les
   * mêmes points, puisque le premier les a déjà retirés du solde.
   *
   * Idempotent par panier : un client qui revient sur l'écran de paiement
   * retrouve SA réservation, il n'en crée pas une seconde.
   */
  async holdForCart(params: {
    cartId: string;
    userId: string;
    organizationId: string;
    points: number;
  }): Promise<number> {
    const panier = await this.prisma.cart.findUnique({
      where: { id: params.cartId },
      select: { loyaltyHoldId: true },
    });

    // Déjà réservé : on rend la réservation existante telle quelle.
    if (panier?.loyaltyHoldId) {
      const mouvement = await this.prisma.loyaltyTransaction.findUnique({
        where: { id: panier.loyaltyHoldId },
        select: { kind: true, points: true },
      });
      if (mouvement && mouvement.kind === LoyaltyEntryKind.HOLD) {
        const reserves = Math.abs(mouvement.points);
        if (reserves === params.points) return reserves;
        // Le montant a changé (le client a modifié son panier) : on rend
        // l'ancienne réservation avant d'en poser une juste.
        await this.releaseHoldForCart(params.cartId);
      } else if (mouvement) {
        // Déjà devenue la dépense d'une commande : plus rien à réserver.
        return Math.abs(mouvement.points);
      }
    }

    if (params.points <= 0) return 0;

    return this.prisma.$transaction(async (tx) => {
      const account = await this.upsertAccount(tx, params.userId, params.organizationId);

      // Contrôle du solde ET débit dans la MÊME instruction — voir
      // `redeemForOrderTx` pour le détail du raisonnement.
      const { count } = await tx.loyaltyAccount.updateMany({
        where: { id: account.id, balance: { gte: params.points } },
        data: { balance: { decrement: params.points } },
      });
      if (count === 0) {
        throw new BadRequestException(
          `Solde de fidélité insuffisant (${account.balance} point(s) disponible(s))`,
        );
      }

      const { balance: balanceAfter } = await tx.loyaltyAccount.findUniqueOrThrow({
        where: { id: account.id },
        select: { balance: true },
      });

      const mouvement = await tx.loyaltyTransaction.create({
        data: {
          accountId: account.id,
          cartId: params.cartId,
          kind: LoyaltyEntryKind.HOLD,
          points: -params.points,
          balanceAfter,
        },
      });
      await tx.cart.update({
        where: { id: params.cartId },
        data: { loyaltyHoldId: mouvement.id },
      });

      this.logger.log(`${params.points} point(s) réservé(s) pour le panier ${params.cartId}`);
      return params.points;
    });
  }

  /**
   * REND la réservation d'un panier qui n'aboutira pas.
   *
   * Sans ce retour, un panier abandonné emporterait les points avec lui : le
   * client les verrait disparaître de son solde sans jamais avoir rien reçu.
   *
   * Ne touche pas une réservation déjà devenue la dépense d'une commande.
   */
  async releaseHoldForCart(cartId: string): Promise<number> {
    const panier = await this.prisma.cart.findUnique({
      where: { id: cartId },
      select: { loyaltyHoldId: true },
    });
    if (!panier?.loyaltyHoldId) return 0;

    return this.prisma.$transaction(async (tx) => {
      const mouvement = await tx.loyaltyTransaction.findUnique({
        where: { id: panier.loyaltyHoldId as string },
        select: { id: true, accountId: true, kind: true, points: true },
      });
      // Déjà convertie en dépense, ou déjà rendue : rien à faire.
      if (!mouvement || mouvement.kind !== LoyaltyEntryKind.HOLD) {
        await tx.cart.update({ where: { id: cartId }, data: { loyaltyHoldId: null } });
        return 0;
      }

      const points = Math.abs(mouvement.points);
      const { balance: balanceAfter } = await tx.loyaltyAccount.update({
        where: { id: mouvement.accountId },
        data: { balance: { increment: points } },
        select: { balance: true },
      });
      await tx.loyaltyTransaction.create({
        data: {
          accountId: mouvement.accountId,
          cartId,
          kind: LoyaltyEntryKind.RELEASE,
          points,
          balanceAfter,
        },
      });
      await tx.cart.update({ where: { id: cartId }, data: { loyaltyHoldId: null } });

      this.logger.log(`${points} point(s) rendu(s) — panier ${cartId} abandonné`);
      return points;
    });
  }

  /**
   * La réservation devient la DÉPENSE de la commande : HOLD → REDEEM.
   *
   * Ne touche PAS au solde : les points en ont été retirés à la réservation. On
   * ne fait qu'attribuer le mouvement à la commande née du paiement. C'est ce
   * qui rend cette étape incapable d'échouer — et donc incapable de faire
   * perdre une commande déjà payée.
   *
   * Le registre garde UN mouvement par dépense : convertir, plutôt qu'ajouter
   * une seconde ligne, garde la somme des mouvements égale au solde.
   */
  async convertHoldToRedeemTx(
    tx: Prisma.TransactionClient,
    params: { cartId: string; orderId: string },
  ): Promise<number> {
    const panier = await tx.cart.findUnique({
      where: { id: params.cartId },
      select: { loyaltyHoldId: true },
    });
    if (!panier?.loyaltyHoldId) return 0;

    const mouvement = await tx.loyaltyTransaction.findUnique({
      where: { id: panier.loyaltyHoldId },
      select: { id: true, kind: true, points: true, orderId: true },
    });
    if (!mouvement) return 0;
    // Rejeu du webhook : déjà attribuée à cette commande.
    if (mouvement.kind === LoyaltyEntryKind.REDEEM) return Math.abs(mouvement.points);
    if (mouvement.kind !== LoyaltyEntryKind.HOLD) return 0;

    await tx.loyaltyTransaction.update({
      where: { id: mouvement.id },
      data: { kind: LoyaltyEntryKind.REDEEM, orderId: params.orderId },
    });
    return Math.abs(mouvement.points);
  }

  /**
   * Rend les réservations des paniers expirés sans paiement.
   *
   * Les points d'un panier abandonné doivent revenir à leur propriétaire. C'est
   * le SEUL chemin de retour : un paiement qui échoue ne rend rien, car le
   * client peut reprendre la même page de paiement — la réservation lui sert
   * encore. L'expiration du panier, elle, est définitive.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async rendreLesReservationsExpirees(): Promise<void> {
    const oublies = await this.prisma.cart.findMany({
      where: {
        loyaltyHoldId: { not: null },
        status: { not: CartStatus.CONVERTED },
        expiresAt: { lt: new Date() },
      },
      select: { id: true },
      take: 200,
    });
    for (const panier of oublies) {
      try {
        await this.releaseHoldForCart(panier.id);
      } catch (e: unknown) {
        this.logger.error(`Réservation non rendue pour le panier ${panier.id} : ${String(e)}`);
      }
    }
  }

  /**
   * Débite les points utilisés sur une commande, SANS réservation préalable.
   *
   * Chemin de secours : le chemin normal réserve les points au départ du
   * paiement (`holdForCart`) puis convertit la réservation
   * (`convertHoldToRedeemTx`). Cette méthode reste pour les paniers engagés
   * AVANT la mise en place de la réservation, et pour le mode démo.
   *
   * Vérifie le solde au moment du débit — le panier a pu être préparé bien avant.
   */
  async redeemForOrderTx(
    tx: Prisma.TransactionClient,
    params: {
      userId: string;
      organizationId: string;
      orderId: string;
      points: number;
    },
  ): Promise<void> {
    if (params.points <= 0) return;

    const account = await this.upsertAccount(tx, params.userId, params.organizationId);

    // Contrôle du solde ET débit dans la MÊME instruction : `updateMany` avec
    // `balance >= points` dans le `where` laisse la base arbitrer. Vérifier
    // d'abord puis débiter ensuite ouvrirait une fenêtre où deux commandes
    // simultanées passent toutes deux le contrôle et dépensent le même solde
    // deux fois — le compte finirait négatif, ou la seconde dépense serait
    // silencieusement offerte.
    const { count } = await tx.loyaltyAccount.updateMany({
      where: { id: account.id, balance: { gte: params.points } },
      data: { balance: { decrement: params.points } },
    });
    if (count === 0) {
      throw new BadRequestException(
        `Solde de fidélité insuffisant (${account.balance} point(s) disponible(s))`,
      );
    }

    // Relu après le débit : `updateMany` ne renvoie pas la ligne, et le solde
    // inscrit au grand livre doit être celui d'après l'opération pour que la
    // somme des mouvements reste égale au solde du compte.
    const { balance: balanceAfter } = await tx.loyaltyAccount.findUniqueOrThrow({
      where: { id: account.id },
      select: { balance: true },
    });

    await tx.loyaltyTransaction.create({
      data: {
        accountId: account.id,
        orderId: params.orderId,
        kind: LoyaltyEntryKind.REDEEM,
        points: -params.points,
        balanceAfter,
      },
    });
  }

  /** Récupère (ou crée) le compte du client chez ce club. */
  private async upsertAccount(
    tx: Prisma.TransactionClient,
    userId: string,
    organizationId: string,
  ) {
    return tx.loyaltyAccount.upsert({
      where: { userId_organizationId: { userId, organizationId } },
      update: {},
      create: { userId, organizationId, balance: 0 },
    });
  }

  /**
   * Tout ce dont l'app a besoin pour un lieu, en UN appel : le programme est-il
   * actif, à quel taux, et combien de points le client a-t-il chez ce club.
   * Évite à l'app de connaître l'organisation (elle ne manipule que des lieux).
   */
  async getVenueStatusForUser(venueId: string, userId: string) {
    const venue = await this.prisma.venue.findUnique({
      where: { id: venueId },
      select: {
        organizationId: true,
        loyaltyEnabled: true,
        loyaltyPointsPerEuro: true,
        loyaltyPointValueCents: true,
      },
    });
    if (!venue) throw new NotFoundException('Venue not found');

    if (!venue.loyaltyEnabled) {
      return { enabled: false, balance: 0, pointsPerEuro: 0, pointValueCents: 0 };
    }
    return {
      enabled: true,
      balance: await this.getBalance(userId, venue.organizationId),
      pointsPerEuro: venue.loyaltyPointsPerEuro,
      pointValueCents: venue.loyaltyPointValueCents,
    };
  }

  /** Vérifie qu'une organisation existe (utilisé par le contrôleur). */
  async assertOrganizationExists(organizationId: string): Promise<void> {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true },
    });
    if (!org) throw new NotFoundException('Organization not found');
  }
}
