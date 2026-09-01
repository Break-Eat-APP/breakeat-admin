import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import { GlobalRole, OrgRole } from '../../common/enums/role.enum';
import { StatsService } from './stats.service';
import { PrismaService } from '../../database/prisma.service';

/**
 * Unit tests for StatsService (Phase 15 — manager dashboard).
 *
 * Focus areas:
 *  - Revenue math reused from BackofficeService: CA HT = round(TTC / 1.10),
 *    average basket, divide-by-zero guard.
 *  - Per-event rollup merge + "currently active" event counting.
 *  - Event analytics: full status breakdown (zero-seeded) + top products.
 *  - Access gating: MANAGE_ROLES only (OPERATOR rejected), 404 on unknown event,
 *    and no revenue queries run when access is denied.
 */
describe('StatsService', () => {
  let service: StatsService;
  let prisma: {
    user: { findUnique: jest.Mock };
    organizationMember: { findUnique: jest.Mock };
    order: { aggregate: jest.Mock; groupBy: jest.Mock; findMany: jest.Mock };
    orderItem: { groupBy: jest.Mock };
    event: { findMany: jest.Mock; findUnique: jest.Mock };
    $queryRaw: jest.Mock;
  };

  /** Ce que renvoie le groupBy « par taux ». Reecrit par les tests concernes. */
  let ventilationMock: Array<{ vatRateBps: number; _sum: { lineTotalCents: number } }> = [];
  /** Ce que renvoie le groupBy « meilleures ventes ». */
  let topProduitsMock: unknown[] = [];

  beforeEach(() => {
    ventilationMock = [];
    topProduitsMock = [];
  });

  const ORG_ID = '11111111-1111-1111-1111-111111111111';
  const EVENT_ID = '22222222-2222-2222-2222-222222222222';
  const USER_ID = '33333333-3333-3333-3333-333333333333';

  /** Make requireOrgAccess resolve for a member holding `role`. */
  function asMember(role: OrgRole) {
    prisma.user.findUnique.mockResolvedValue({ globalRole: GlobalRole.CUSTOMER });
    prisma.organizationMember.findUnique.mockResolvedValue({ orgRole: role });
  }

  beforeEach(async () => {
    prisma = {
      user: { findUnique: jest.fn() },
      organizationMember: { findUnique: jest.fn() },
      order: { aggregate: jest.fn(), groupBy: jest.fn(), findMany: jest.fn() },
      orderItem: { groupBy: jest.fn() },
      event: { findMany: jest.fn(), findUnique: jest.fn() },
      $queryRaw: jest.fn().mockResolvedValue([]),
    };

    // `orderItem.groupBy` sert deux lectures aux formes differentes : les
    // meilleures ventes (par produit) et la ventilation TVA (par taux). Un mock
    // unique renverrait la forme de l'une a l'autre et produirait des NaN
    // silencieux -- exactement le genre de faux vert qu'on ne veut pas.
    prisma.orderItem.groupBy.mockImplementation((args: { by: string[] }) =>
      Promise.resolve(args.by.includes('vatRateBps') ? ventilationMock : topProduitsMock),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get(StatsService);
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('getOrgOverview', () => {
    it('aggregates org KPIs at 10% VAT and merges per-event revenue', async () => {
      asMember(OrgRole.MANAGER);

      const now = Date.now();
      const activeEvent = {
        id: 'e1',
        name: 'Soirée',
        status: 'PUBLISHED',
        startAt: new Date(now - 3_600_000),
        endAt: new Date(now + 3_600_000),
      };
      const pastEvent = {
        id: 'e2',
        name: 'Match',
        status: 'COMPLETED',
        startAt: new Date(now - 7_200_000),
        endAt: new Date(now - 3_600_000),
      };

      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalCents: 11_000 },
        _count: { _all: 4 },
      });
      prisma.event.findMany.mockResolvedValue([activeEvent, pastEvent]);
      prisma.order.groupBy.mockResolvedValue([
        { eventId: 'e1', _sum: { totalCents: 8_000 }, _count: { _all: 3 } },
        { eventId: 'e2', _sum: { totalCents: 3_000 }, _count: { _all: 1 } },
      ]);

      const result = await service.getOrgOverview(ORG_ID, USER_ID);

      // Only SUCCEEDED payments count, scoped to the org, CANCELLED excluded.
      expect(prisma.order.aggregate).toHaveBeenCalledWith({
        where: { organizationId: ORG_ID, paymentStatus: PaymentStatus.SUCCEEDED, status: { not: OrderStatus.CANCELLED } },
        _sum: { totalCents: true },
        _count: { _all: true },
      });

      expect(result.revenue.caTtcCents).toBe(11_000);
      expect(result.revenue.caHtCents).toBe(10_000); // 11000 / 1.10
      expect(result.revenue.vatRate).toBe(0.1);
      expect(result.revenue.vatBreakdown).toEqual([
        { vatRateBps: 1000, label: '10 %', ttcCents: 11_000, htCents: 10_000, tvaCents: 1_000 },
      ]);
      expect(result.ordersCount).toBe(4);
      expect(result.averageBasket.ttcCents).toBe(2_750);
      expect(result.averageBasket.htCents).toBe(2_500);

      expect(result.eventsCount).toBe(2);
      expect(result.activeEventsCount).toBe(1); // only the in-progress event

      const e1 = result.events.find((e) => e.id === 'e1');
      expect(e1?.caTtcCents).toBe(8_000);
      expect(e1?.caHtCents).toBe(7_273); // round(8000 / 1.10)
      expect(e1?.ordersCount).toBe(3);
    });

    it('returns zeroes and avoids divide-by-zero for an empty org', async () => {
      prisma.user.findUnique.mockResolvedValue({ globalRole: GlobalRole.SUPER_ADMIN });
      prisma.order.aggregate.mockResolvedValue({ _sum: { totalCents: null }, _count: { _all: 0 } });
      prisma.event.findMany.mockResolvedValue([]);
      prisma.order.groupBy.mockResolvedValue([]);

      const result = await service.getOrgOverview(ORG_ID, USER_ID);

      expect(result.revenue.caTtcCents).toBe(0);
      expect(result.revenue.caHtCents).toBe(0);
      expect(result.revenue.vatBreakdown).toEqual([]);
      expect(result.ordersCount).toBe(0);
      expect(result.averageBasket.ttcCents).toBe(0);
      expect(result.averageBasket.htCents).toBe(0);
      expect(result.eventsCount).toBe(0);
      expect(result.activeEventsCount).toBe(0);
      expect(result.events).toEqual([]);
    });

    it('rejects a non-manager (OPERATOR) and runs no revenue query', async () => {
      asMember(OrgRole.OPERATOR);

      await expect(service.getOrgOverview(ORG_ID, USER_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.order.aggregate).not.toHaveBeenCalled();
    });
  });

  describe('getEventStats', () => {
    it('returns revenue, a full status breakdown and top products', async () => {
      prisma.user.findUnique.mockResolvedValue({ globalRole: GlobalRole.SUPER_ADMIN });
      prisma.event.findUnique.mockResolvedValue({
        id: EVENT_ID,
        name: 'Soirée',
        status: 'PUBLISHED',
        startAt: new Date('2026-06-01T18:00:00Z'),
        endAt: new Date('2026-06-01T23:00:00Z'),
        organizationId: ORG_ID,
      });
      prisma.order.aggregate.mockResolvedValue({
        _sum: { totalCents: 5_000 },
        _count: { _all: 2 },
      });
      prisma.order.groupBy.mockResolvedValue([
        { status: OrderStatus.READY, _count: { _all: 1 } },
        { status: OrderStatus.COMPLETED, _count: { _all: 1 } },
      ]);
      topProduitsMock = [
        { productId: 'p1', productNameSnapshot: 'Bière', _sum: { quantity: 10, lineTotalCents: 4_000 } },
        { productId: 'p2', productNameSnapshot: 'Frites', _sum: { quantity: 5, lineTotalCents: 1_000 } },
      ];
      // 40 € de bière à 20 %, 10 € de frites à 10 % : deux taux, un seul soir.
      ventilationMock = [
        { vatRateBps: 1000, _sum: { lineTotalCents: 1_000 } },
        { vatRateBps: 2000, _sum: { lineTotalCents: 4_000 } },
      ];

      const result = await service.getEventStats(EVENT_ID, USER_ID);

      // Top products query is scoped via the related order.
      expect(prisma.orderItem.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { order: { eventId: EVENT_ID, paymentStatus: PaymentStatus.SUCCEEDED, status: { not: OrderStatus.CANCELLED } } },
        }),
      );

      expect(result.event.id).toBe(EVENT_ID);
      expect(result.revenue.caTtcCents).toBe(5_000);
      // Le HT ne se déduit PAS d'un taux unique : 1000/1,10 + 4000/1,20.
      // Un calcul à 10 % pour tout aurait annoncé 4 545 € et sous-déclaré la
      // TVA sur la bière de près de 130 €.
      expect(result.revenue.caHtCents).toBe(909 + 3_333);
      expect(result.revenue.vatBreakdown).toEqual([
        { vatRateBps: 1000, label: '10 %', ttcCents: 1_000, htCents: 909, tvaCents: 91 },
        { vatRateBps: 2000, label: '20 %', ttcCents: 4_000, htCents: 3_333, tvaCents: 667 },
      ]);
      expect(result.ordersCount).toBe(2);
      expect(result.averageBasket.ttcCents).toBe(2_500);

      // Every status is seeded; only the two reported are non-zero.
      expect(result.ordersByStatus[OrderStatus.READY]).toBe(1);
      expect(result.ordersByStatus[OrderStatus.COMPLETED]).toBe(1);
      expect(result.ordersByStatus[OrderStatus.PAID]).toBe(0);
      expect(result.ordersByStatus[OrderStatus.CANCELLED]).toBe(0);

      expect(result.topProducts).toEqual([
        { productId: 'p1', name: 'Bière', quantity: 10, revenueCents: 4_000 },
        { productId: 'p2', name: 'Frites', quantity: 5, revenueCents: 1_000 },
      ]);
    });

    it('throws 404 for an unknown event before any access check', async () => {
      prisma.event.findUnique.mockResolvedValue(null);

      await expect(service.getEventStats(EVENT_ID, USER_ID)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
      expect(prisma.order.aggregate).not.toHaveBeenCalled();
    });

    it('rejects a non-member of the owning org with 403', async () => {
      prisma.event.findUnique.mockResolvedValue({
        id: EVENT_ID,
        name: 'Soirée',
        status: 'PUBLISHED',
        startAt: new Date('2026-06-01T18:00:00Z'),
        endAt: new Date('2026-06-01T23:00:00Z'),
        organizationId: ORG_ID,
      });
      prisma.user.findUnique.mockResolvedValue({ globalRole: GlobalRole.CUSTOMER });
      prisma.organizationMember.findUnique.mockResolvedValue(null); // not a member

      await expect(service.getEventStats(EVENT_ID, USER_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.order.aggregate).not.toHaveBeenCalled();
    });
  });

  // ─── getPeriodStats (phase 22) ────────────────────────────────
  //
  // La lecture des lieux ouverts en continu. Le risque n'est pas l'arithmétique
  // — elle est partagée avec le reste — mais le DÉCOUPAGE : une commande rangée
  // dans la mauvaise journée, ou un jour creux qui disparaît du graphique,
  // donnent un chiffre juste au total et faux là où on le lit.

  describe('getPeriodStats', () => {
    function order(iso: string, cents: number) {
      return { createdAt: new Date(iso), totalCents: cents };
    }

    beforeEach(() => {
      prisma.orderItem.groupBy.mockResolvedValue([]);
    });

    it('range chaque commande dans sa journée, et garde les jours creux', async () => {
      asMember(OrgRole.MANAGER);
      prisma.order.findMany.mockResolvedValue([
        order('2026-08-10T12:00:00', 1_000),
        order('2026-08-10T19:30:00', 2_000),
        order('2026-08-12T12:00:00', 500),
      ]);

      const r = await service.getPeriodStats(ORG_ID, USER_ID, {
        granularity: 'day',
        from: '2026-08-10T00:00:00',
        to: '2026-08-12T23:59:59',
      });

      expect(r.buckets).toHaveLength(3);
      expect(r.buckets[0].caTtcCents).toBe(3_000);
      expect(r.buckets[0].ordersCount).toBe(2);
      // Le 11 n'a rien vendu : il DOIT rester, à zéro. Le supprimer ferait
      // relier le 10 au 12 comme si la journée n'avait pas existé.
      expect(r.buckets[1].caTtcCents).toBe(0);
      expect(r.buckets[2].caTtcCents).toBe(500);
    });

    it('totalise l’ensemble de la fenêtre', async () => {
      asMember(OrgRole.MANAGER);
      prisma.order.findMany.mockResolvedValue([
        order('2026-08-10T12:00:00', 1_100),
        order('2026-08-11T12:00:00', 1_000),
      ]);

      const r = await service.getPeriodStats(ORG_ID, USER_ID, {
        granularity: 'day',
        from: '2026-08-10T00:00:00',
        to: '2026-08-11T23:59:59',
      });

      expect(r.revenue.caTtcCents).toBe(2_100);
      expect(r.ordersCount).toBe(2);
      // CA HT = TTC / 1,10 — même règle que partout ailleurs.
      expect(r.revenue.caHtCents).toBe(Math.round(2_100 / 1.1));
    });

    it('fait commencer les semaines le lundi', async () => {
      asMember(OrgRole.MANAGER);
      // Le 16 août 2026 est un dimanche : il appartient à la semaine du lundi 10.
      prisma.order.findMany.mockResolvedValue([order('2026-08-16T20:00:00', 900)]);

      const r = await service.getPeriodStats(ORG_ID, USER_ID, {
        granularity: 'week',
        from: '2026-08-10T00:00:00',
        to: '2026-08-16T23:59:59',
      });

      expect(r.buckets).toHaveLength(1);
      expect(new Date(r.buckets[0].startAt).getDay()).toBe(1); // lundi
      expect(r.buckets[0].caTtcCents).toBe(900);
    });

    it('regroupe par mois calendaire', async () => {
      asMember(OrgRole.MANAGER);
      prisma.order.findMany.mockResolvedValue([
        order('2026-07-03T12:00:00', 100),
        order('2026-07-28T12:00:00', 200),
        order('2026-08-01T12:00:00', 300),
      ]);

      const r = await service.getPeriodStats(ORG_ID, USER_ID, {
        granularity: 'month',
        from: '2026-07-01T00:00:00',
        to: '2026-08-31T23:59:59',
      });

      expect(r.buckets).toHaveLength(2);
      expect(r.buckets[0].caTtcCents).toBe(300);
      expect(r.buckets[1].caTtcCents).toBe(300);
    });

    it('remet une plage inversée à l’endroit', async () => {
      asMember(OrgRole.MANAGER);
      prisma.order.findMany.mockResolvedValue([]);

      const r = await service.getPeriodStats(ORG_ID, USER_ID, {
        granularity: 'day',
        from: '2026-08-12T00:00:00',
        to: '2026-08-10T00:00:00',
      });

      // Plutôt qu'un résultat vide sans explication.
      expect(new Date(r.from) <= new Date(r.to)).toBe(true);
      expect(r.buckets.length).toBeGreaterThan(0);
    });

    it('n’interroge rien quand l’accès est refusé', async () => {
      asMember(OrgRole.OPERATOR);

      await expect(service.getPeriodStats(ORG_ID, USER_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.order.findMany).not.toHaveBeenCalled();
    });

    it('n’agrège jamais une commande annulée ou impayée', async () => {
      asMember(OrgRole.MANAGER);
      prisma.order.findMany.mockResolvedValue([]);

      await service.getPeriodStats(ORG_ID, USER_ID);

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            paymentStatus: PaymentStatus.SUCCEEDED,
            status: { not: OrderStatus.CANCELLED },
          }),
        }),
      );
    });
  });
});
