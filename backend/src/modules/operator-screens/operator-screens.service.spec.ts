import { Test } from '@nestjs/testing';
import { OperatorScreenKind, OrderStatus } from '@prisma/client';
import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';
import { OperatorScreensService } from './operator-screens.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Prisma mock ─────────────────────────────────────────────────

const prisma = {
  user: { findUnique: jest.fn() },
  organizationMember: { findUnique: jest.fn() },
  event: { findUnique: jest.fn() },
  operatorScreenTemplate: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  eventOperatorScreen: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

// ─── Constants + factories ───────────────────────────────────────

const ORG_ID = 'org-uuid';
const EVT_ID = 'evt-uuid';
const USER_ID = 'user-uuid';
const TPL_ID = 'tpl-uuid';

/** Membership/role helpers — drive requireOrgAccess + supplier pinning. */
function asManager(): void {
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ globalRole: 'CUSTOMER' });
  (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({
    orgRole: 'MANAGER',
    supplierId: null,
  });
}
function asOperatorPinned(supplierId: string): void {
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ globalRole: 'CUSTOMER' });
  (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue({
    orgRole: 'OPERATOR',
    supplierId,
  });
}
function asNonMember(): void {
  (prisma.user.findUnique as jest.Mock).mockResolvedValue({ globalRole: 'CUSTOMER' });
  (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(null);
}

function makeTemplate(overrides: Record<string, unknown> = {}) {
  return {
    id: 't1',
    organizationId: ORG_ID,
    name: 'Screen',
    kind: OperatorScreenKind.ORDERS_QUEUE,
    icon: null,
    sortOrder: 0,
    enabled: true,
    slotKinds: [],
    statuses: [],
    supplierIds: [],
    filters: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Suite ───────────────────────────────────────────────────────

describe('OperatorScreensService', () => {
  let service: OperatorScreensService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [OperatorScreensService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = module.get(OperatorScreensService);
  });

  // ─── sanitizeFilters (pure) ───────────────────────────────────

  describe('sanitizeFilters', () => {
    it('keeps known keys, drops unknown, dedups string arrays', () => {
      const out = OperatorScreensService.sanitizeFilters({
        categoryIds: ['a', 'a', 'b'],
        productIds: [1, 'p'],
        showRecap: true,
        junk: 'ignored',
      });
      expect(out).toEqual({ categoryIds: ['a', 'b'], productIds: ['p'], showRecap: true });
    });

    it('returns {} for non-object input', () => {
      expect(OperatorScreensService.sanitizeFilters(null)).toEqual({});
      expect(OperatorScreensService.sanitizeFilters('nope')).toEqual({});
      expect(OperatorScreensService.sanitizeFilters(undefined)).toEqual({});
    });

    it('omits empty arrays and non-boolean showRecap', () => {
      const out = OperatorScreensService.sanitizeFilters({ categoryIds: [], showRecap: 'yes' });
      expect(out).toEqual({});
    });
  });

  // ─── createTemplate ───────────────────────────────────────────

  describe('createTemplate', () => {
    it('persists with defaults and trims the name', async () => {
      asManager();
      (prisma.operatorScreenTemplate.create as jest.Mock).mockResolvedValue(makeTemplate());

      await service.createTemplate(ORG_ID, USER_ID, { name: '  Immédiates  ' });

      const { data } = (prisma.operatorScreenTemplate.create as jest.Mock).mock.calls[0][0];
      expect(data.name).toBe('Immédiates');
      expect(data.kind).toBe(OperatorScreenKind.ORDERS_QUEUE);
      expect(data.enabled).toBe(true);
      expect(data.slotKinds).toEqual([]);
      expect(data.statuses).toEqual([]);
      expect(data.filters).toEqual({});
    });

    it('rejects a non-member (403)', async () => {
      asNonMember();
      await expect(
        service.createTemplate(ORG_ID, USER_ID, { name: 'x' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.operatorScreenTemplate.create).not.toHaveBeenCalled();
    });
  });

  // ─── resolveForEvent ──────────────────────────────────────────

  describe('resolveForEvent', () => {
    it('fills default statuses from kind and sorts by effective order', async () => {
      asManager();
      (prisma.event.findUnique as jest.Mock).mockResolvedValue({ organizationId: ORG_ID });
      (prisma.eventOperatorScreen.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'l1',
          sortOrder: null, // ⇒ falls back to template.sortOrder = 2
          enabled: true,
          template: makeTemplate({ id: 't1', name: 'Ready', kind: 'READY', sortOrder: 2 }),
        },
        {
          id: 'l2',
          sortOrder: 0, // effective 0 < 2 ⇒ first
          enabled: true,
          template: makeTemplate({ id: 't2', name: 'Queue', kind: 'ORDERS_QUEUE', sortOrder: 5 }),
        },
      ]);

      const res = await service.resolveForEvent(EVT_ID, USER_ID);

      // Sorted by effective order: l2 (0) before l1 (2).
      const [queue, ready] = res.screens;
      expect(queue.templateId).toBe('t2');
      expect(ready.templateId).toBe('t1');
      expect(ready.statuses).toEqual([OrderStatus.READY]);
      expect(queue.statuses).toEqual([
        OrderStatus.PAID,
        OrderStatus.ACCEPTED,
        OrderStatus.PREPARING,
      ]);
    });

    it('pins to the membership supplier and hides other-supplier screens', async () => {
      asOperatorPinned('sup-1');
      (prisma.event.findUnique as jest.Mock).mockResolvedValue({ organizationId: ORG_ID });
      (prisma.eventOperatorScreen.findMany as jest.Mock).mockResolvedValue([
        { id: 'l1', sortOrder: 0, enabled: true, template: makeTemplate({ id: 't1', supplierIds: ['sup-2'] }) },
        { id: 'l2', sortOrder: 1, enabled: true, template: makeTemplate({ id: 't2', supplierIds: [] }) },
        { id: 'l3', sortOrder: 2, enabled: true, template: makeTemplate({ id: 't3', supplierIds: ['sup-1'] }) },
      ]);

      const res = await service.resolveForEvent(EVT_ID, USER_ID, 'param-ignored');

      expect(res.supplierId).toBe('sup-1'); // pin wins over the query param
      expect(res.screens.map((s) => s.templateId)).toEqual(['t2', 't3']);
    });

    it('404s for an unknown event', async () => {
      asManager();
      (prisma.event.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.resolveForEvent(EVT_ID, USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── applyToEvent ─────────────────────────────────────────────

  describe('applyToEvent', () => {
    it('maps a duplicate application to ConflictException', async () => {
      asManager();
      (prisma.event.findUnique as jest.Mock).mockResolvedValue({ organizationId: ORG_ID });
      (prisma.operatorScreenTemplate.findFirst as jest.Mock).mockResolvedValue(makeTemplate({ id: TPL_ID }));
      (prisma.eventOperatorScreen.create as jest.Mock).mockRejectedValue({ code: 'P2002' });

      await expect(
        service.applyToEvent(EVT_ID, USER_ID, { templateId: TPL_ID }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects applying a template from another organisation (404)', async () => {
      asManager();
      (prisma.event.findUnique as jest.Mock).mockResolvedValue({ organizationId: ORG_ID });
      (prisma.operatorScreenTemplate.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.applyToEvent(EVT_ID, USER_ID, { templateId: TPL_ID }),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.eventOperatorScreen.create).not.toHaveBeenCalled();
    });
  });
});
