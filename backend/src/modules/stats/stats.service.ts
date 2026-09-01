import { Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  requireOrgAccess,
  MANAGE_ROLES,
} from '../../common/helpers/require-org-access';
import {
  tauxMoyenBps,
  ventilerSurTotal,
  type LigneTva,
  type TrancheTva,
  type VentilationTva,
} from '../../common/helpers/tva';
import { ventilationCommandes } from '../../common/helpers/ventilation-commandes';

/**
 * Le chiffre d'affaires d'un périmètre (organisation ou événement), en centimes
 * entiers. `Order.totalCents` est TTC ; le HT se déduit du TAUX DE CHAQUE
 * LIGNE, pas d'un taux unique : une buvette qui vend une bière (20 %) et un
 * sandwich (10 %) n'a pas un taux, elle en a deux, et sa déclaration se remplit
 * taux par taux. Voir `common/helpers/tva.ts`.
 */
export interface RevenueBlock {
  caTtcCents: number;
  caHtCents: number;
  /**
   * Taux MOYEN effectivement collecté (0.13 = 13 %), pour une étiquette de
   * vignette quand la place manque. Jamais une base de déclaration : c'est
   * `vatBreakdown` qui fait foi.
   */
  vatRate: number;
  /** Le détail par taux, du plus bas au plus élevé. Vide si aucune vente. */
  vatBreakdown: TrancheTva[];
}

export interface BasketBlock {
  htCents: number;
  ttcCents: number;
}

/** One event row inside an org overview, with its own revenue rollup. */
export interface OrgEventStat {
  id: string;
  name: string;
  status: string;
  startAt: string;
  endAt: string;
  caTtcCents: number;
  caHtCents: number;
  ordersCount: number;
}

export interface OrgStatsOverview {
  organizationId: string;
  revenue: RevenueBlock;
  ordersCount: number;
  averageBasket: BasketBlock;
  eventsCount: number;
  /** Events currently in progress (startAt <= now <= endAt). */
  activeEventsCount: number;
  events: OrgEventStat[];
}

/** Granularité d'une lecture par période. */
export type PeriodGranularity = 'day' | 'week' | 'month';

/** Une tranche de temps avec son chiffre d'affaires. */
export interface PeriodBucket {
  /** Début de la tranche, en ISO. Le libellé se compose côté interface. */
  startAt: string;
  caTtcCents: number;
  caHtCents: number;
  ordersCount: number;
}

export interface PeriodStats {
  organizationId: string;
  granularity: PeriodGranularity;
  from: string;
  to: string;
  revenue: RevenueBlock;
  ordersCount: number;
  averageBasket: BasketBlock;
  /** Tranches triées du plus ancien au plus récent, y compris les vides. */
  buckets: PeriodBucket[];
  /** Meilleures ventes sur la période (max 10). */
  topProducts: TopProduct[];
}

export interface TopProduct {
  productId: string;
  name: string;
  quantity: number;
  revenueCents: number;
}

export interface EventStats {
  event: {
    id: string;
    name: string;
    status: string;
    startAt: string;
    endAt: string;
    organizationId: string;
  };
  revenue: RevenueBlock;
  ordersCount: number;
  averageBasket: BasketBlock;
  /** Count of revenue-qualifying orders per lifecycle status (sums to ordersCount). */
  ordersByStatus: Record<OrderStatus, number>;
  /** Best sellers by quantity (max 10). */
  topProducts: TopProduct[];
}

/**
 * StatsService — org/event analytics for the manager dashboard.
 *
 * Access: gated to MANAGE_ROLES (ORG_ADMIN, MANAGER) via requireOrgAccess —
 * revenue is sensitive, so OPERATOR / MARKETING members are excluded.
 * SUPER_ADMIN bypasses (handled inside requireOrgAccess).
 *
 * Revenue rule (mirrors BackofficeService): an order counts toward CA only when
 * paymentStatus = SUCCEEDED ET status ≠ CANCELLED (commandes annulées exclues,
 * cohérent avec le libellé de l'UI compta). Le CA HT se déduit du taux de TVA
 * figé sur chaque ligne de commande — voir `common/helpers/tva.ts`.
 *
 * Read-only: no schema, no writes — pure aggregation over existing tables.
 */
@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Org overview ─────────────────────────────────────────────

  /**
   * Org-wide KPIs (CA HT/TTC, order count, average basket) plus a per-event
   * revenue breakdown. Restricted to managers of the org.
   */
  async getOrgOverview(orgId: string, userId: string): Promise<OrgStatsOverview> {
    await requireOrgAccess(this.prisma, userId, orgId, MANAGE_ROLES);

    const [agg, events, perEvent] = await Promise.all([
      this.prisma.order.aggregate({
        where: { organizationId: orgId, paymentStatus: PaymentStatus.SUCCEEDED, status: { not: OrderStatus.CANCELLED } },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
      this.prisma.event.findMany({
        // Contenant permanent exclu : une ligne « Service continu » agrégeant
        // tout le chiffre d'affaires depuis l'ouverture n'apprend rien. Pour un
        // lieu permanent, la lecture utile est par période — c'est le prochain
        // chantier (statistiques par jour / semaine).
        where: { organizationId: orgId, isPermanentContainer: false },
        orderBy: { startAt: 'desc' },
        select: { id: true, name: true, status: true, startAt: true, endAt: true },
      }),
      this.prisma.order.groupBy({
        by: ['eventId'],
        where: { organizationId: orgId, paymentStatus: PaymentStatus.SUCCEEDED, status: { not: OrderStatus.CANCELLED } },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
    ]);

    const revByEvent = new Map<string, { ttc: number; count: number }>();
    for (const row of perEvent) {
      revByEvent.set(row.eventId, {
        ttc: row._sum.totalCents ?? 0,
        count: row._count._all,
      });
    }

    const caTtcCents = agg._sum.totalCents ?? 0;
    const ordersCount = agg._count._all;

    // Les lignes de commande, groupees par evenement ET par taux, en une seule
    // requete : le HT de chaque evenement depend de ce qu'il a vendu. Un match
    // ou la biere domine n'a pas le meme HT qu'un match sans buvette alcool, et
    // une moyenne appliquee a tous effacerait justement cet ecart.
    const lignesParEvenement = await this.lignesParEvenement(orgId);
    const ventilationOrg = ventilerSurTotal(
      [...lignesParEvenement.values()].flat(),
      caTtcCents,
    );

    const now = new Date();
    const eventStats: OrgEventStat[] = events.map((e) => {
      const r = revByEvent.get(e.id) ?? { ttc: 0, count: 0 };
      const v = ventilerSurTotal(lignesParEvenement.get(e.id) ?? [], r.ttc);
      return {
        id: e.id,
        name: e.name,
        status: e.status,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt.toISOString(),
        caTtcCents: r.ttc,
        caHtCents: v.htCents,
        ordersCount: r.count,
      };
    });

    const activeEventsCount = events.filter(
      (e) => e.startAt <= now && e.endAt >= now,
    ).length;

    return {
      organizationId: orgId,
      revenue: StatsService.bloc(ventilationOrg),
      ordersCount,
      averageBasket: this.averageBasket(caTtcCents, ventilationOrg.htCents, ordersCount),
      eventsCount: events.length,
      activeEventsCount,
      events: eventStats,
    };
  }

  // ─── Lecture par période ──────────────────────────────────────

  /**
   * PHASE 22 — chiffre d'affaires découpé dans le temps.
   *
   * C'est la lecture des lieux ouverts en continu : un restaurant ne se lit
   * pas « par match », il se lit par jour, par semaine ou par mois. La
   * répartition par événement, elle, reste pour les stades.
   *
   * L'agrégation se fait sur `Order.createdAt` : l'événement n'intervient à
   * aucun moment, ce qui rend cette lecture valable pour les deux rythmes.
   */
  async getPeriodStats(
    orgId: string,
    userId: string,
    options: { granularity?: PeriodGranularity; from?: string; to?: string } = {},
  ): Promise<PeriodStats> {
    await requireOrgAccess(this.prisma, userId, orgId, MANAGE_ROLES);

    const granularity = options.granularity ?? 'day';
    const { from, to } = this.resolveRange(options.from, options.to, granularity);

    const revenueWhere = {
      organizationId: orgId,
      paymentStatus: PaymentStatus.SUCCEEDED,
      status: { not: OrderStatus.CANCELLED },
      createdAt: { gte: from, lte: to },
    };

    const [orders, topItems] = await Promise.all([
      // Les commandes brutes, pas un groupBy SQL : PostgreSQL grouperait en UTC
      // alors qu'un service du soir doit tomber dans la bonne journée locale.
      // Le volume est borné par la fenêtre demandée.
      this.prisma.order.findMany({
        where: revenueWhere,
        select: { createdAt: true, totalCents: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId', 'productNameSnapshot'],
        where: { order: revenueWhere },
        _sum: { quantity: true, lineTotalCents: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
      }),
    ]);

    // Toutes les tranches sont pré-remplies à zéro : un jour sans vente est une
    // information, pas un trou. Sans ça, un graphique relierait deux dates
    // éloignées comme si de rien n'était.
    const buckets = new Map<string, { ttc: number; count: number }>();
    for (const start of this.enumerateBuckets(from, to, granularity)) {
      buckets.set(start.toISOString(), { ttc: 0, count: 0 });
    }
    for (const order of orders) {
      const key = this.bucketStart(order.createdAt, granularity).toISOString();
      const bucket = buckets.get(key);
      if (!bucket) continue; // hors fenêtre après arrondi — ignoré
      bucket.ttc += order.totalCents;
      bucket.count += 1;
    }

    const caTtcCents = orders.reduce((sum, o) => sum + o.totalCents, 0);
    const ordersCount = orders.length;
    const ventilation = await ventilationCommandes(this.prisma, revenueWhere, caTtcCents);

    // Le HT d'une TRANCHE est reparti au prorata du taux moyen de la periode.
    // Le detail exact par taux vit dans `revenue.vatBreakdown` : c'est lui qui
    // sert a declarer. Descendre la ventilation jusqu'a chaque journee
    // demanderait de ramener toutes les lignes de trente jours de service --
    // des centaines de milliers, pour une colonne indicative.
    const partHt = caTtcCents === 0 ? 0 : ventilation.htCents / caTtcCents;

    return {
      organizationId: orgId,
      granularity,
      from: from.toISOString(),
      to: to.toISOString(),
      revenue: StatsService.bloc(ventilation),
      ordersCount,
      averageBasket: this.averageBasket(caTtcCents, ventilation.htCents, ordersCount),
      buckets: [...buckets.entries()].map(([startAt, b]) => ({
        startAt,
        caTtcCents: b.ttc,
        caHtCents: Math.round(b.ttc * partHt),
        ordersCount: b.count,
      })),
      topProducts: topItems.map((row) => ({
        productId: row.productId,
        name: row.productNameSnapshot,
        quantity: row._sum.quantity ?? 0,
        revenueCents: row._sum.lineTotalCents ?? 0,
      })),
    };
  }

  /**
   * Fenêtre par défaut selon la granularité : 30 jours, 12 semaines ou 12 mois.
   * Une plage explicite l'emporte ; une plage inversée est remise à l'endroit
   * plutôt que de renvoyer un résultat vide sans explication.
   */
  private resolveRange(
    fromRaw: string | undefined,
    toRaw: string | undefined,
    granularity: PeriodGranularity,
  ): { from: Date; to: Date } {
    const to = this.parseDate(toRaw) ?? new Date();
    let from = this.parseDate(fromRaw);
    if (!from) {
      from = new Date(to);
      if (granularity === 'day') from.setDate(from.getDate() - 29);
      else if (granularity === 'week') from.setDate(from.getDate() - 7 * 11);
      else from.setMonth(from.getMonth() - 11);
    }
    if (from > to) return { from: to, to: from };
    return { from: this.bucketStart(from, granularity), to };
  }

  private parseDate(raw?: string): Date | null {
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  /** Début de la tranche contenant `date`. Les semaines commencent le lundi. */
  private bucketStart(date: Date, granularity: PeriodGranularity): Date {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    if (granularity === 'week') {
      // getDay() renvoie 0 pour dimanche : on le ramène à 6 pour que la
      // semaine commence lundi, comme partout en restauration.
      const offset = (d.getDay() + 6) % 7;
      d.setDate(d.getDate() - offset);
    } else if (granularity === 'month') {
      d.setDate(1);
    }
    return d;
  }

  private enumerateBuckets(from: Date, to: Date, granularity: PeriodGranularity): Date[] {
    const out: Date[] = [];
    const cursor = this.bucketStart(from, granularity);
    // Borne de sécurité : une plage absurde (dix ans en jours) ne doit pas
    // faire exploser la réponse ni la mémoire.
    const MAX_BUCKETS = 400;
    while (cursor <= to && out.length < MAX_BUCKETS) {
      out.push(new Date(cursor));
      if (granularity === 'day') cursor.setDate(cursor.getDate() + 1);
      else if (granularity === 'week') cursor.setDate(cursor.getDate() + 7);
      else cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }

  // ─── Event detail ─────────────────────────────────────────────

  /**
   * Per-event analytics: revenue, average basket, lifecycle status breakdown
   * and best sellers. 404 if the event is unknown; 403 if the caller is not a
   * manager of the owning org.
   */
  async getEventStats(eventId: string, userId: string): Promise<EventStats> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        status: true,
        startAt: true,
        endAt: true,
        organizationId: true,
      },
    });
    if (!event) throw new NotFoundException('Event not found');

    await requireOrgAccess(this.prisma, userId, event.organizationId, MANAGE_ROLES);

    const [agg, byStatus, topItems] = await Promise.all([
      this.prisma.order.aggregate({
        where: { eventId, paymentStatus: PaymentStatus.SUCCEEDED, status: { not: OrderStatus.CANCELLED } },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: { eventId, paymentStatus: PaymentStatus.SUCCEEDED, status: { not: OrderStatus.CANCELLED } },
        _count: { _all: true },
      }),
      this.prisma.orderItem.groupBy({
        by: ['productId', 'productNameSnapshot'],
        where: { order: { eventId, paymentStatus: PaymentStatus.SUCCEEDED, status: { not: OrderStatus.CANCELLED } } },
        _sum: { quantity: true, lineTotalCents: true },
        orderBy: { _sum: { quantity: 'desc' } },
        take: 10,
      }),
    ]);

    // Seed every status to 0 so the UI always renders the full lifecycle.
    const ordersByStatus = Object.values(OrderStatus).reduce(
      (acc, status) => {
        acc[status] = 0;
        return acc;
      },
      {} as Record<OrderStatus, number>,
    );
    for (const row of byStatus) {
      ordersByStatus[row.status] = row._count._all;
    }

    const caTtcCents = agg._sum.totalCents ?? 0;
    const ordersCount = agg._count._all;
    const ventilation = await ventilationCommandes(
      this.prisma,
      { eventId, paymentStatus: PaymentStatus.SUCCEEDED, status: { not: OrderStatus.CANCELLED } },
      caTtcCents,
    );

    const topProducts: TopProduct[] = topItems.map((row) => ({
      productId: row.productId,
      name: row.productNameSnapshot,
      quantity: row._sum.quantity ?? 0,
      revenueCents: row._sum.lineTotalCents ?? 0,
    }));

    return {
      event: {
        id: event.id,
        name: event.name,
        status: event.status,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt.toISOString(),
        organizationId: event.organizationId,
      },
      revenue: StatsService.bloc(ventilation),
      ordersCount,
      averageBasket: this.averageBasket(caTtcCents, ventilation.htCents, ordersCount),
      ordersByStatus,
      topProducts,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────

  /**
   * Les lignes de commande d'une organisation, groupees par evenement et par
   * taux de TVA, en une requete.
   *
   * Prisma ne sait pas grouper sur un champ de la relation parente
   * (`order.eventId`) : d'ou le SQL direct. L'alternative -- une requete par
   * evenement -- multiplierait les allers-retours par le nombre de matchs de la
   * saison, sur une page que le gerant ouvre en debut de mois.
   *
   * `::bigint` puis `Number()` : la somme d'une saison depasse la capacite d'un
   * entier 32 bits bien avant d'approcher la limite d'un nombre JavaScript.
   */
  private async lignesParEvenement(orgId: string): Promise<Map<string, LigneTva[]>> {
    const rows = await this.prisma.$queryRaw<
      Array<{ eventId: string; vatRateBps: number; ttc: bigint | number }>
    >`
      SELECT o.event_id AS "eventId",
             oi.vat_rate_bps AS "vatRateBps",
             SUM(oi.line_total_cents)::bigint AS "ttc"
        FROM order_items oi
        JOIN orders o ON o.id = oi.order_id
       WHERE o.organization_id = ${orgId}
         AND o.payment_status::text = 'SUCCEEDED'
         AND o.status::text <> 'CANCELLED'
       GROUP BY 1, 2
    `;

    const parEvenement = new Map<string, LigneTva[]>();
    for (const row of rows) {
      const lignes = parEvenement.get(row.eventId) ?? [];
      lignes.push({ vatRateBps: Number(row.vatRateBps), ttcCents: Number(row.ttc) });
      parEvenement.set(row.eventId, lignes);
    }
    return parEvenement;
  }

  /** Le bloc revenu, ventilé par taux, prêt à renvoyer. */
  private static bloc(v: VentilationTva): RevenueBlock {
    return {
      caTtcCents: v.ttcCents,
      caHtCents: v.htCents,
      vatRate: tauxMoyenBps(v) / 10_000,
      vatBreakdown: v.tranches,
    };
  }

  /** Average basket; guards against division by zero on empty scopes. */
  private averageBasket(
    caTtcCents: number,
    caHtCents: number,
    ordersCount: number,
  ): BasketBlock {
    if (ordersCount <= 0) return { htCents: 0, ttcCents: 0 };
    return {
      ttcCents: Math.round(caTtcCents / ordersCount),
      htCents: Math.round(caHtCents / ordersCount),
    };
  }
}
