import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CartStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { StripeService } from '../payments/stripe.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { SlotsService } from '../slots/slots.service';
import { rendreLeStock } from '../stock/retenue-stock';

/** Un paiement ouvert depuis plus longtemps est considéré comme abandonné. */
export const DELAI_ABANDON_MS = 30 * 60 * 1000;

/**
 * Une page de paiement hébergée (version web) sans `PaymentIntent` connu ne se
 * vérifie pas auprès de Stripe : on attend qu'elle ait expiré d'elle-même
 * (24 h, réglage par défaut de Stripe), plus une heure de marge.
 */
export const DELAI_PAGE_HEBERGEE_MS = 25 * 60 * 60 * 1000;

/** Ces états peuvent encore aboutir à un encaissement : on ne touche à rien. */
const ENCORE_PAYABLE = new Set(['succeeded', 'processing', 'requires_capture']);

const PAR_PASSAGE = 50;

/**
 * LES PAIEMENTS ABANDONNÉS RENDENT CE QU'ILS RETENAIENT (audit Codex du
 * 17/11/2026).
 *
 * Au moment de payer, le panier retient le stock, la place du créneau et les
 * points de fidélité — AVANT Stripe, pour qu'un client qui paie ne perde
 * jamais ce qu'il a choisi. Mais un client qui ferme la feuille de paiement
 * laissait son panier « en attente de paiement » pour toujours : aucun
 * webhook n'arrive pour un paiement simplement abandonné, et rien ne rendait
 * ce qu'il retenait. Un soir de match, des articles et des créneaux auraient
 * paru complets alors que personne ne les occupait.
 *
 * Toutes les 5 minutes, pour chaque panier en attente depuis plus de 30 min :
 *  1. on demande à STRIPE où en est le paiement. S'il peut encore aboutir
 *     (réussi, en cours, autorisé), on ne touche à rien : le webhook créera
 *     la commande. Sinon on l'ANNULE chez Stripe — plus personne ne pourra le
 *     payer — et seulement ensuite on rend ;
 *  2. le panier passe « abandonné » par une bascule CONDITIONNELLE : une seule
 *     instance rend, une seule fois ;
 *  3. on rend les points, la place du créneau et le stock.
 *
 * Jamais de commande perdue : un paiement réussi n'est jamais annulé, et
 * Stripe refuse d'annuler un paiement déjà encaissé (l'erreur fait sauter ce
 * panier, il est relu au passage suivant).
 */
@Injectable()
export class PaiementsAbandonnesService {
  private readonly logger = new Logger(PaiementsAbandonnesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly loyalty: LoyaltyService,
    private readonly slots: SlotsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async tic(): Promise<void> {
    try {
      await this.liberer(new Date());
    } catch (e: unknown) {
      this.logger.error(`Paiements abandonnés : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Rend le nombre de paniers libérés. */
  async liberer(maintenant: Date): Promise<number> {
    const candidats = await this.prisma.cart.findMany({
      where: {
        status: CartStatus.CHECKOUT_PENDING,
        updatedAt: { lt: new Date(maintenant.getTime() - DELAI_ABANDON_MS) },
      },
      select: { id: true, paymentIntentId: true, updatedAt: true },
      orderBy: { updatedAt: 'asc' },
      take: PAR_PASSAGE,
    });

    let liberes = 0;
    for (const panier of candidats) {
      try {
        if (await this.libererUn(panier, maintenant)) liberes += 1;
      } catch (e: unknown) {
        // Ce panier est relu au passage suivant ; les autres continuent.
        this.logger.warn(
          `Panier ${panier.id} : paiement abandonné non libéré (${e instanceof Error ? e.message : String(e)})`,
        );
      }
    }
    return liberes;
  }

  private async libererUn(
    panier: { id: string; paymentIntentId: string | null; updatedAt: Date },
    maintenant: Date,
  ): Promise<boolean> {
    // 1. Le paiement ne doit plus pouvoir aboutir.
    if (panier.paymentIntentId) {
      const paiement = await this.stripe.retrievePaymentIntent(panier.paymentIntentId);
      if (ENCORE_PAYABLE.has(paiement.status)) return false;
      if (paiement.status !== 'canceled') {
        await this.stripe.cancelPaymentIntent(panier.paymentIntentId);
      }
    } else if (panier.updatedAt.getTime() > maintenant.getTime() - DELAI_PAGE_HEBERGEE_MS) {
      return false; // page hébergée encore valable chez Stripe
    }

    // 2. Une seule instance rend, une seule fois.
    const bascule = await this.prisma.cart.updateMany({
      where: { id: panier.id, status: CartStatus.CHECKOUT_PENDING },
      data: { status: CartStatus.ABANDONED },
    });
    if (bascule.count === 0) return false;

    // 3. Ce que le panier retenait.
    await this.loyalty.releaseHoldForCart(panier.id);
    const retenu = await this.prisma.cart.findUnique({
      where: { id: panier.id },
      select: {
        selectedSlotId: true,
        slotReservedAt: true,
        stockReservedAt: true,
        pickupPointId: true,
        items: { select: { productId: true, quantity: true } },
      },
    });
    if (retenu?.selectedSlotId && retenu.slotReservedAt) {
      await this.slots.libererUnePlace(retenu.selectedSlotId);
    }
    if (retenu?.stockReservedAt) {
      await rendreLeStock(this.prisma, retenu.pickupPointId, retenu.items);
    }
    await this.prisma.cart.update({
      where: { id: panier.id },
      data: { slotReservedAt: null, stockReservedAt: null },
    });

    this.logger.log(
      `Panier ${panier.id} : paiement abandonné — ${retenu?.slotReservedAt ? 'place du créneau, ' : ''}` +
        `${retenu?.stockReservedAt ? 'stock, ' : ''}points rendus.`,
    );
    return true;
  }
}
