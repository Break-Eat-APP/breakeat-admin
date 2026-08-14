import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  requireOrgAccess,
  MANAGE_ROLES,
} from '../../common/helpers/require-org-access';

/**
 * Revenue figures for a scope (org or event). All monetary values are integer
 * cents. `Order.totalCents` is tax-inclusive (TTC); HT is derived from TTC using
 * the configured reporting VAT rate, identically to BackofficeService so the
 * manager numbers reconcile with the SUPER_ADMIN back office.
 */
export interface RevenueBlock {
  caTtcCents: number;
  caHtCents: number;
  /** VAT rate used to derive HT from TTC (e.g. 0.1 for 10%). */
  vatRate: number;
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
 * cohérent avec le libellé de l'UI compta). CA HT = round(CA TTC / (1 + vatRate)).
 *
 * Read-only: no schema, no writes — pure aggregation over existing tables.
 */
@Injectable()
export class StatsService {
  private readonly vatRate: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const configured = this.config.get<number>('app.reporting.vatRate');
    // Guard against a missing / NaN env override; fall back to 10%.
    this.vatRate =
      typeof configured === 'number' &&
      Number.isFinite(configured) &&
      configured >= 0
        ? configured
        : 0.1;
  }

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

    const now = new Date();
    const eventStats: OrgEventStat[] = events.map((e) => {
      const r = revByEvent.get(e.id) ?? { ttc: 0, count: 0 };
      return {
        id: e.id,
        name: e.name,
        status: e.status,
        startAt: e.startAt.toISOString(),
        endAt: e.endAt.toISOString(),
        caTtcCents: r.ttc,
        caHtCents: this.toHtCents(r.ttc),
        ordersCount: r.count,
      };
    });

    const caTtcCents = agg._sum.totalCents ?? 0;
    const ordersCount = agg._count._all;
    const caHtCents = this.toHtCents(caTtcCents);
    const activeEventsCount = events.filter(
      (e) => e.startAt <= now && e.endAt >= now,
    ).length;

    return {
      organizationId: orgId,
      revenue: { caTtcCents, caHtCents, vatRate: this.vatRate },
      ordersCount,
      averageBasket: this.averageBasket(caTtcCents, caHtCents, ordersCount),
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
    const caHtCents = this.toHtCents(caTtcCents);

    return {
      organizationId: orgId,
      granularity,
      from: from.toISOString(),
      to: to.toISOString(),
      revenue: { caTtcCents, caHtCents, vatRate: this.vatRate },
      ordersCount,
      averageBasket: this.averageBasket(caTtcCents, caHtCents, ordersCount),
      buckets: [...buckets.entries()].map(([startAt, b]) => ({
        startAt,
        caTtcCents: b.ttc,
        caHtCents: this.toHtCents(b.ttc),
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
    const caHtCents = this.toHtCents(caTtcCents);

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
      revenue: { caTtcCents, caHtCents, vatRate: this.vatRate },
      ordersCount,
      averageBasket: this.averageBasket(caTtcCents, caHtCents, ordersCount),
      ordersByStatus,
      topProducts,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────

  /** TTC cents → HT cents using the configured reporting VAT rate. */
  private toHtCents(ttcCents: number): number {
    return Math.round(ttcCents / (1 + this.vatRate));
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
