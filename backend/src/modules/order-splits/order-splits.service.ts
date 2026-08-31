import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import {
  CartStatus,
  OrderSplitShareStatus,
  OrderSplitStatus,
  OrderSplitUnitStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { StripeService } from '../payments/stripe.service';
import { OrdersService } from '../orders/orders.service';

/**
 * OrderSplitsService — « l'ardoise » : une tournée composée par un hôte, réglée
 * à plusieurs, dont un seul a l'application.
 *
 * Le trajet :
 *   1. l'hôte compose son panier et ouvre une ardoise ;
 *   2. il partage un lien ; chaque convive ouvre une PAGE WEB, coche SES
 *      articles et paie par carte — sans rien installer ;
 *   3. chaque paiement AUTORISE la carte sans la débiter ;
 *   4. quand tout est couvert, l'hôte envoie : on encaisse, la commande part.
 *
 * Deux garanties tiennent l'ensemble :
 *
 *   • Chacun paie SA nourriture à la buvette (destination charge Connect).
 *     Break Eat ne détient jamais l'argent d'un tiers — ce serait un autre
 *     métier que vendre à manger.
 *
 *   • Rien n'est prélevé avant le départ de la commande. Une tournée qui
 *     capote ne laisse aucun remboursement à faire : les autorisations non
 *     capturées se libèrent seules.
 */

/** Alphabet du code partagé : ni I, ni O, ni 0, ni 1 — il se dit à voix haute. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LONGUEUR_CODE = 6;
const ESSAIS_MAX = 5;

/** Une ardoise vaut pour un service. */
const DUREE_MS = 6 * 60 * 60 * 1000;

/**
 * Combien de temps une case cochée reste réservée pendant que le convive paie.
 *
 * Assez pour saisir une carte sans se presser, assez court pour qu'un ami qui
 * ferme son téléphone ne bloque pas la tournée des autres.
 */
const RESERVATION_MS = 5 * 60 * 1000;

export interface VueArdoise {
  code: string;
  status: OrderSplitStatus;
  supplierName: string | null;
  eventId: string;
  supplierId: string;
  totalCents: number;
  paidCents: number;
  units: Array<{
    id: string;
    productName: string;
    unitPriceCents: number;
    status: OrderSplitUnitStatus;
    claimantName: string | null;
  }>;
}

@Injectable()
export class OrderSplitsService {
  private readonly logger = new Logger(OrderSplitsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
  ) {}

  /** La fonction est-elle ouverte ? (interrupteur d'environnement) */
  estActive(): boolean {
    return this.config.get<boolean>('app.split.enabled') === true;
  }

  private assertActive(): void {
    if (!this.estActive()) {
      throw new BadRequestException('Le partage d’addition n’est pas activé.');
    }
  }

  private genererCode(): string {
    let code = '';
    for (let i = 0; i < LONGUEUR_CODE; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    return code;
  }

  // ─── Ouverture ──────────────────────────────────────────────

  /**
   * Ouvre une ardoise à partir du panier de l'hôte.
   *
   * Chaque article devient autant d'UNITÉS que sa quantité : « 3 bières » donne
   * trois cases à cocher. C'est ce qui permet à deux convives d'en prendre une
   * chacun — une ligne indivisible casserait le principe dès la première tournée.
   *
   * Les prix sont figés ici : le tarif ne doit pas bouger sous le convive entre
   * le moment où il coche et celui où il paie.
   */
  async ouvrir(userId: string, cartId: string) {
    this.assertActive();

    const cart = await this.prisma.cart.findUnique({
      where: { id: cartId },
      include: {
        items: { include: { product: { select: { id: true, name: true, price: true } } } },
        event: { select: { organizationId: true, venueId: true } },
      },
    });
    if (!cart) throw new NotFoundException('Cart not found');
    if (cart.userId !== userId) throw new ForbiddenException('You do not own this cart');
    if (cart.status !== CartStatus.OPEN) {
      throw new BadRequestException(`Cart is ${cart.status} — only OPEN carts can be shared`);
    }
    if (cart.items.length === 0) throw new BadRequestException('Cart is empty');

    // Une seule ardoise ouverte à la fois : en rouvrir une seconde invaliderait
    // le lien déjà partagé au groupe.
    const existante = await this.prisma.orderSplit.findFirst({
      where: { hostUserId: userId, status: OrderSplitStatus.OPEN, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (existante) return this.decrire(existante.id);

    const unites = cart.items.flatMap((item) =>
      Array.from({ length: item.quantity }, () => ({
        productId: item.productId,
        productName: item.product.name,
        unitPriceCents: item.priceSnapshotCents ?? item.product.price,
      })),
    );

    for (let essai = 0; essai < ESSAIS_MAX; essai++) {
      try {
        const split = await this.prisma.orderSplit.create({
          data: {
            code: this.genererCode(),
            organizationId: cart.event.organizationId,
            eventId: cart.eventId,
            venueId: cart.event.venueId,
            supplierId: cart.supplierId,
            pickupPointId: cart.pickupPointId,
            selectedSlotId: cart.selectedSlotId,
            hostUserId: userId,
            expiresAt: new Date(Date.now() + DUREE_MS),
            units: { create: unites },
          },
        });
        this.logger.log(`Ardoise ouverte ${split.code} — ${unites.length} unités`);
        return this.decrire(split.id);
      } catch (e: unknown) {
        const collision = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002';
        if (!collision) throw e;
      }
    }
    throw new BadRequestException('Impossible de générer un code d’ardoise');
  }

  // ─── Consultation ───────────────────────────────────────────

  /**
   * Vue publique d'une ardoise, par son code. Aucun compte requis : c'est la
   * page que le convive ouvre depuis le message de son ami.
   *
   * Ne renvoie aucune donnée personnelle : des articles, des prix, et les
   * prénoms que les convives ont bien voulu donner.
   */
  async consulter(code: string): Promise<VueArdoise> {
    const split = await this.prisma.orderSplit.findUnique({
      where: { code: code.trim().toUpperCase() },
      select: { id: true },
    });
    if (!split) throw new NotFoundException('Ardoise introuvable');
    return this.decrire(split.id);
  }

  private async decrire(splitId: string): Promise<VueArdoise> {
    // Les réservations mortes sont libérées à la LECTURE, pas par une tâche
    // planifiée : c'est le seul moment où quelqu'un attend la réponse, et ça
    // évite une mécanique de fond à surveiller.
    await this.libererReservationsExpirees(splitId);

    const split = await this.prisma.orderSplit.findUnique({
      where: { id: splitId },
      include: { units: { include: { share: { select: { claimantName: true } } } } },
    });
    if (!split) throw new NotFoundException('Ardoise introuvable');

    const buvette = await this.prisma.supplier.findUnique({
      where: { id: split.supplierId },
      select: { name: true },
    });

    const units = split.units.map((u) => ({
      id: u.id,
      productName: u.productName,
      unitPriceCents: u.unitPriceCents,
      status: u.status,
      claimantName: u.share?.claimantName ?? null,
    }));

    return {
      code: split.code,
      status: split.status,
      supplierName: buvette?.name ?? null,
      eventId: split.eventId,
      supplierId: split.supplierId,
      totalCents: units.reduce((sum, u) => sum + u.unitPriceCents, 0),
      paidCents: units
        .filter((u) => u.status === OrderSplitUnitStatus.PAID)
        .reduce((sum, u) => sum + u.unitPriceCents, 0),
      units,
    };
  }

  /** Rend au pot commun les cases cochées puis abandonnées. */
  private async libererReservationsExpirees(splitId: string): Promise<void> {
    await this.prisma.orderSplitUnit.updateMany({
      where: {
        splitId,
        status: OrderSplitUnitStatus.RESERVED,
        reservedUntil: { lt: new Date() },
      },
      data: { status: OrderSplitUnitStatus.FREE, shareId: null, reservedUntil: null },
    });
  }

  // ─── Prendre sa part et payer ───────────────────────────────

  /**
   * Le convive coche ses articles : on les réserve et on ouvre sa page de
   * paiement Stripe.
   *
   * La réservation est CONDITIONNELLE (`status: FREE` dans le `updateMany`) :
   * si deux convives cochent la même bière au même instant, le second n'en
   * réserve aucune et on le lui dit — plutôt que de faire payer deux fois le
   * même article.
   */
  async prendreSaPart(params: {
    code: string;
    unitIds: string[];
    claimantName?: string;
    isHost?: boolean;
  }): Promise<{ shareId: string; checkoutUrl: string; amountCents: number }> {
    this.assertActive();
    if (params.unitIds.length === 0) {
      throw new BadRequestException('Aucun article sélectionné');
    }

    const split = await this.prisma.orderSplit.findUnique({
      where: { code: params.code.trim().toUpperCase() },
    });
    if (!split) throw new NotFoundException('Ardoise introuvable');
    if (split.status !== OrderSplitStatus.OPEN) {
      throw new BadRequestException('Cette ardoise est close');
    }
    if (split.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Cette ardoise a expiré');
    }

    await this.libererReservationsExpirees(split.id);

    const buvette = await this.prisma.supplier.findUnique({
      where: { id: split.supplierId },
      select: { name: true, stripeAccountId: true },
    });
    if (!buvette?.stripeAccountId) {
      throw new BadRequestException('Cette buvette n’accepte pas encore les paiements en ligne');
    }

    const share = await this.prisma.orderSplitShare.create({
      data: {
        splitId: split.id,
        claimantName: params.claimantName?.trim().slice(0, 40) || null,
        isHost: params.isHost ?? false,
        amountCents: 0,
      },
    });

    // Réservation CONDITIONNELLE : seules les unités encore libres basculent.
    const reserve = await this.prisma.orderSplitUnit.updateMany({
      where: { id: { in: params.unitIds }, splitId: split.id, status: OrderSplitUnitStatus.FREE },
      data: {
        status: OrderSplitUnitStatus.RESERVED,
        shareId: share.id,
        reservedUntil: new Date(Date.now() + RESERVATION_MS),
      },
    });
    if (reserve.count !== params.unitIds.length) {
      // Quelqu'un a été plus rapide : on rend ce qu'on avait pris et on renvoie
      // le convive vers la liste à jour.
      await this.libererPart(share.id);
      throw new BadRequestException(
        'Un des articles vient d’être pris par quelqu’un d’autre. Rafraîchis la liste.',
      );
    }

    const unites = await this.prisma.orderSplitUnit.findMany({ where: { shareId: share.id } });
    const amountCents = unites.reduce((sum, u) => sum + u.unitPriceCents, 0);

    const webUrl = this.config.get<string>('app.split.webUrl') ?? '';
    const retour = `${webUrl}/split/${split.code}`;

    try {
      const session = await this.stripe.createHostedCheckout({
        amountCents,
        currency: 'eur',
        destinationAccountId: buvette.stripeAccountId,
        productName: `Ma part — ${buvette.name ?? 'commande Break Eat'}`,
        successUrl: `${retour}?paye=1`,
        cancelUrl: `${retour}?annule=1`,
        idempotencyKey: `split-share-${share.id}`,
        metadata: { orderSplitShareId: share.id, orderSplitCode: split.code },
      });

      await this.prisma.orderSplitShare.update({
        where: { id: share.id },
        data: { amountCents, stripeSessionId: session.id },
      });

      return { shareId: share.id, checkoutUrl: session.url ?? retour, amountCents };
    } catch (e: unknown) {
      // Sans page de paiement, garder les articles réservés priverait les autres
      // convives d'articles que personne ne paiera.
      await this.libererPart(share.id);
      throw e;
    }
  }

  /** Rend les unités d'une part au pot commun et clôt la part. */
  private async libererPart(shareId: string): Promise<void> {
    await this.prisma.orderSplitUnit.updateMany({
      where: { shareId },
      data: { status: OrderSplitUnitStatus.FREE, shareId: null, reservedUntil: null },
    });
    await this.prisma.orderSplitShare.update({
      where: { id: shareId },
      data: { status: OrderSplitShareStatus.CANCELLED },
    });
  }

  // ─── Retour de Stripe ───────────────────────────────────────

  /**
   * Stripe confirme qu'une part est AUTORISÉE (carte bloquée, rien de prélevé).
   * Les unités correspondantes se verrouillent sur leur payeur.
   */
  async marquerPartAutorisee(sessionId: string, paymentIntentId: string): Promise<void> {
    const share = await this.prisma.orderSplitShare.findUnique({
      where: { stripeSessionId: sessionId },
    });
    if (!share) {
      this.logger.warn(`Session Stripe inconnue au retour : ${sessionId}`);
      return;
    }
    if (share.status !== OrderSplitShareStatus.PENDING) return;

    await this.prisma.$transaction([
      this.prisma.orderSplitShare.update({
        where: { id: share.id },
        data: { status: OrderSplitShareStatus.AUTHORIZED, stripePaymentIntentId: paymentIntentId },
      }),
      // `reservedUntil` repasse à null : une part payée ne se libère plus.
      this.prisma.orderSplitUnit.updateMany({
        where: { shareId: share.id },
        data: { status: OrderSplitUnitStatus.PAID, reservedUntil: null },
      }),
    ]);
    this.logger.log(`Part autorisée ${share.id} (${share.amountCents} c)`);
  }

  // ─── Envoi de la commande ───────────────────────────────────

  /**
   * L'hôte envoie la tournée : on ENCAISSE toutes les parts autorisées, puis on
   * crée la commande.
   *
   * L'encaissement précède la création : une commande partie en cuisine sans
   * que l'argent soit pris serait servie gratuitement. L'inverse — encaisser
   * sans commande — se rattrape, lui, par un remboursement.
   */
  async envoyer(userId: string, code: string) {
    this.assertActive();

    const split = await this.prisma.orderSplit.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: { units: true, shares: true },
    });
    if (!split) throw new NotFoundException('Ardoise introuvable');
    if (split.hostUserId !== userId) {
      throw new ForbiddenException('Seul l’auteur de la tournée peut l’envoyer');
    }
    if (split.status !== OrderSplitStatus.OPEN) {
      throw new BadRequestException('Cette ardoise est déjà close');
    }

    const nonPayees = split.units.filter((u) => u.status !== OrderSplitUnitStatus.PAID);
    if (nonPayees.length > 0) {
      throw new BadRequestException(
        `${nonPayees.length} article(s) ne sont pas réglés. Paie le reste ou retire-les.`,
      );
    }

    const aEncaisser = split.shares.filter(
      (s) => s.status === OrderSplitShareStatus.AUTHORIZED && s.stripePaymentIntentId,
    );

    const echecs: string[] = [];
    for (const share of aEncaisser) {
      try {
        await this.stripe.capturePaymentIntent(share.stripePaymentIntentId as string);
        await this.prisma.orderSplitShare.update({
          where: { id: share.id },
          data: { status: OrderSplitShareStatus.CAPTURED },
        });
      } catch (e: unknown) {
        // Une autorisation expirée ou refusée ne doit pas faire perdre les
        // autres : on encaisse ce qui peut l'être et on nomme ce qui a échoué.
        this.logger.error(`Encaissement échoué pour la part ${share.id}: ${String(e)}`);
        echecs.push(share.claimantName ?? 'un convive');
      }
    }
    if (echecs.length > 0) {
      throw new BadRequestException(
        `Le paiement de ${echecs.join(', ')} n’a pas pu être encaissé. Demande-lui de refaire sa part.`,
      );
    }

    const order = await this.orders.createFromSplit(split.id);

    await this.prisma.orderSplit.update({
      where: { id: split.id },
      data: { status: OrderSplitStatus.SENT, orderId: order.id },
    });

    this.logger.log(`Ardoise ${split.code} envoyée — commande ${order.publicOrderNumber}`);
    return order;
  }

  // ─── Annulation ─────────────────────────────────────────────

  /**
   * L'hôte renonce : on libère TOUTES les autorisations. Personne n'a été
   * prélevé, il n'y a donc aucun remboursement — seulement des réserves qui
   * disparaissent des relevés.
   */
  async annuler(userId: string, code: string): Promise<{ liberees: number }> {
    const split = await this.prisma.orderSplit.findUnique({
      where: { code: code.trim().toUpperCase() },
      include: { shares: true },
    });
    if (!split) throw new NotFoundException('Ardoise introuvable');
    if (split.hostUserId !== userId) {
      throw new ForbiddenException('Seul l’auteur de la tournée peut l’annuler');
    }
    if (split.status !== OrderSplitStatus.OPEN) {
      throw new BadRequestException('Cette ardoise est déjà close');
    }

    let liberees = 0;
    for (const share of split.shares) {
      if (share.status !== OrderSplitShareStatus.AUTHORIZED || !share.stripePaymentIntentId) {
        continue;
      }
      try {
        await this.stripe.cancelPaymentIntent(share.stripePaymentIntentId);
        liberees++;
      } catch (e: unknown) {
        this.logger.error(`Libération échouée pour la part ${share.id}: ${String(e)}`);
      }
      await this.prisma.orderSplitShare.update({
        where: { id: share.id },
        data: { status: OrderSplitShareStatus.CANCELLED },
      });
    }

    await this.prisma.orderSplit.update({
      where: { id: split.id },
      data: { status: OrderSplitStatus.CANCELLED },
    });
    return { liberees };
  }
}
