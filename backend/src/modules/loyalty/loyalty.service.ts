import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LoyaltyEntryKind, Prisma } from '@prisma/client';
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
   * Débite les points utilisés sur une commande. Appelé DANS la transaction de
   * création de commande (le débit et la commande doivent vivre ou mourir
   * ensemble : jamais de points perdus sans commande, ni de remise sans débit).
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
