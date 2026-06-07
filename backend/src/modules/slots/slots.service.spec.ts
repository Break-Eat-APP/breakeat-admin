import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SlotSource, SlotStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SlotsService } from './slots.service';

// ─── Helpers ─────────────────────────────────────────────────

const ORG_ID          = 'org-1';
const EVENT_ID        = 'event-1';
const SLOT_ID         = 'slot-1';
const USER_ID         = 'user-1';
const SUPPLIER_ID     = 'sup-1';
const PICKUP_POINT_ID = 'pp-1';

const mockOrg   = { id: ORG_ID };
const mockEvent = { id: EVENT_ID, organizationId: ORG_ID, organization: mockOrg };

const makeSlot = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id:            SLOT_ID,
  eventId:       EVENT_ID,
  supplierId:    null,
  pickupPointId: null,
  startAt:       new Date('2026-07-01T12:00:00Z'),
  endAt:         new Date('2026-07-01T12:15:00Z'),
  capacity:      10,
  currentLoad:   0,
  status:        SlotStatus.OPEN,
  source:        SlotSource.MANUAL,
  label:         '12:00–12:15',
  createdAt:     new Date(),
  updatedAt:     new Date(),
  ...overrides,
});

// ─── Prisma mock ─────────────────────────────────────────────

let mockPrisma: Record<string, jest.Mock>;

function buildPrisma() {
  mockPrisma = {
    userFindUnique:          jest.fn(),   // required by requireOrgAccess (SUPER_ADMIN check)
    eventFindUnique:         jest.fn(),
    eventFindUniqueOrThrow:  jest.fn(),
    eventSupplierFindUnique: jest.fn(),
    pickupPointFindUnique:   jest.fn(),
    slotCreate:              jest.fn(),
    slotFindMany:            jest.fn(),
    slotFindUnique:          jest.fn(),
    slotUpdate:              jest.fn(),
    slotUpdateMany:          jest.fn(),
    slotDelete:              jest.fn(),
    orderCount:              jest.fn(),
    orderUpdate:             jest.fn(),
    orgMemberFindUnique:     jest.fn(),
  };

  return {
    user: {
      findUnique: (a: unknown) => mockPrisma.userFindUnique(a),
    },
    event: {
      findUnique:        (a: unknown) => mockPrisma.eventFindUnique(a),
      findUniqueOrThrow: (a: unknown) => mockPrisma.eventFindUniqueOrThrow(a),
    },
    eventSupplier: {
      findUnique: (a: unknown) => mockPrisma.eventSupplierFindUnique(a),
    },
    pickupPoint: {
      findUnique: (a: unknown) => mockPrisma.pickupPointFindUnique(a),
    },
    slot: {
      create:     (a: unknown) => mockPrisma.slotCreate(a),
      findMany:   (a: unknown) => mockPrisma.slotFindMany(a),
      findUnique: (a: unknown) => mockPrisma.slotFindUnique(a),
      update:     (a: unknown) => mockPrisma.slotUpdate(a),
      updateMany: (a: unknown) => mockPrisma.slotUpdateMany(a),
      delete:     (a: unknown) => mockPrisma.slotDelete(a),
    },
    order: {
      count:  (a: unknown) => mockPrisma.orderCount(a),
      update: (a: unknown) => mockPrisma.orderUpdate(a),
    },
    organizationMember: {
      findUnique: (a: unknown) => mockPrisma.orgMemberFindUnique(a),
    },
  };
}

// ─── Suite ───────────────────────────────────────────────────

describe('SlotsService', () => {
  let service: SlotsService;

  beforeEach(async () => {
    const prismaInstance = buildPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SlotsService,
        { provide: PrismaService, useValue: prismaInstance },
      ],
    }).compile();

    service = module.get(SlotsService);

    // Default happy-path stubs
    mockPrisma.userFindUnique.mockResolvedValue({ globalRole: 'CUSTOMER' }); // not SUPER_ADMIN
    mockPrisma.eventFindUnique.mockResolvedValue(mockEvent);
    mockPrisma.eventFindUniqueOrThrow.mockResolvedValue(mockEvent);
    mockPrisma.orgMemberFindUnique.mockResolvedValue({ orgRole: 'MANAGER' });
    mockPrisma.eventSupplierFindUnique.mockResolvedValue({ eventId: EVENT_ID, supplierId: SUPPLIER_ID });
    mockPrisma.pickupPointFindUnique.mockResolvedValue({ id: PICKUP_POINT_ID, eventId: EVENT_ID });
    mockPrisma.slotCreate.mockResolvedValue(makeSlot());
    mockPrisma.slotFindMany.mockResolvedValue([makeSlot()]);
    mockPrisma.slotFindUnique.mockResolvedValue(makeSlot());
    mockPrisma.slotUpdate.mockResolvedValue(makeSlot());
    mockPrisma.slotUpdateMany.mockResolvedValue({ count: 1 });
    mockPrisma.slotDelete.mockResolvedValue(makeSlot());
    mockPrisma.orderCount.mockResolvedValue(0);
    mockPrisma.orderUpdate.mockResolvedValue({});
  });

  const baseDto = {
    startAt:  '2026-07-01T12:00:00Z',
    endAt:    '2026-07-01T12:15:00Z',
    capacity: 10,
    label:    '12:00–12:15',
  };

  // ─── create ────────────────────────────────────────────────

  describe('create', () => {
    it('creates a slot with MANUAL source and OPEN status', async () => {
      const result = await service.create(EVENT_ID, baseDto, USER_ID);
      expect(mockPrisma.slotCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventId:  EVENT_ID,
            capacity: 10,
            source:   SlotSource.MANUAL,
            status:   SlotStatus.OPEN,
          }),
        }),
      );
      expect(result.id).toBe(SLOT_ID);
    });

    it('throws NotFoundException when event does not exist', async () => {
      mockPrisma.eventFindUnique.mockResolvedValue(null);
      await expect(service.create(EVENT_ID, baseDto, USER_ID))
        .rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when endAt <= startAt', async () => {
      await expect(
        service.create(EVENT_ID, { ...baseDto, endAt: '2026-07-01T11:59:00Z' }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when supplierId is not attached to event', async () => {
      mockPrisma.eventSupplierFindUnique.mockResolvedValue(null);
      await expect(
        service.create(EVENT_ID, { ...baseDto, supplierId: 'unknown-sup' }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when pickupPointId does not belong to event', async () => {
      mockPrisma.pickupPointFindUnique.mockResolvedValue({ id: PICKUP_POINT_ID, eventId: 'other-event' });
      await expect(
        service.create(EVENT_ID, { ...baseDto, pickupPointId: PICKUP_POINT_ID }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when caller is not a member (requireOrgAccess)', async () => {
      mockPrisma.orgMemberFindUnique.mockResolvedValue(null);
      await expect(service.create(EVENT_ID, baseDto, USER_ID)).rejects.toThrow();
    });
  });

  // ─── findByEvent ───────────────────────────────────────────

  describe('findByEvent', () => {
    it('returns slots ordered by startAt asc', async () => {
      const result = await service.findByEvent(EVENT_ID);
      expect(mockPrisma.slotFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where:   { eventId: EVENT_ID },
          orderBy: { startAt: 'asc' },
        }),
      );
      expect(result).toHaveLength(1);
    });
  });

  // ─── findOne ───────────────────────────────────────────────

  describe('findOne', () => {
    it('returns the slot when found', async () => {
      const result = await service.findOne(SLOT_ID);
      expect(result.id).toBe(SLOT_ID);
    });

    it('throws NotFoundException when slot does not exist', async () => {
      mockPrisma.slotFindUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ────────────────────────────────────────────────

  describe('update', () => {
    it('updates label and capacity', async () => {
      await service.update(SLOT_ID, { label: 'New label', capacity: 20 }, USER_ID);
      expect(mockPrisma.slotUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ label: 'New label', capacity: 20 }),
        }),
      );
    });

    it('manually closes a slot via status override', async () => {
      await service.update(SLOT_ID, { status: SlotStatus.CLOSED }, USER_ID);
      expect(mockPrisma.slotUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: SlotStatus.CLOSED }),
        }),
      );
    });

    it('throws BadRequestException when new time window is invalid', async () => {
      // startAt unchanged (12:00), new endAt before it
      await expect(
        service.update(SLOT_ID, { endAt: '2026-07-01T11:00:00Z' }, USER_ID),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when slot does not exist', async () => {
      mockPrisma.slotFindUnique.mockResolvedValue(null);
      await expect(service.update('missing', {}, USER_ID))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes an empty slot and returns deleted id', async () => {
      const result = await service.remove(SLOT_ID, USER_ID);
      expect(mockPrisma.slotDelete).toHaveBeenCalledWith({ where: { id: SLOT_ID } });
      expect(result).toEqual({ deleted: SLOT_ID });
    });

    it('throws ConflictException when orders are assigned to the slot', async () => {
      mockPrisma.orderCount.mockResolvedValue(3);
      await expect(service.remove(SLOT_ID, USER_ID)).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when slot does not exist', async () => {
      mockPrisma.slotFindUnique.mockResolvedValue(null);
      await expect(service.remove('missing', USER_ID)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── assignOrderToSlot ─────────────────────────────────────

  describe('assignOrderToSlot', () => {
    const ORDER_ID = 'order-1';

    function makeTx(slotOverrides: Partial<Record<string, unknown>> = {}) {
      const slotState     = makeSlot(slotOverrides);
      const slotUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const orderUpdate    = jest.fn().mockResolvedValue({});
      return {
        slot: {
          findUnique: jest.fn().mockResolvedValue(slotState),
          updateMany: slotUpdateMany,
        },
        order: {
          update: orderUpdate,
        },
        _slotUpdateMany: slotUpdateMany,
        _orderUpdate:    orderUpdate,
      };
    }

    it('increments currentLoad and updates order slotId', async () => {
      const tx = makeTx();
      await service.assignOrderToSlot(ORDER_ID, SLOT_ID, tx as never);
      expect(tx._slotUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { currentLoad: { increment: 1 } } }),
      );
      expect(tx._orderUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: { slotId: SLOT_ID } }),
      );
    });

    it('throws NotFoundException when slot does not exist in tx', async () => {
      const tx = makeTx();
      tx.slot.findUnique = jest.fn().mockResolvedValue(null);
      await expect(service.assignOrderToSlot(ORDER_ID, SLOT_ID, tx as never))
        .rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when slot is CLOSED', async () => {
      const tx = makeTx({ status: SlotStatus.CLOSED });
      await expect(service.assignOrderToSlot(ORDER_ID, SLOT_ID, tx as never))
        .rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException when slot is FULL', async () => {
      const tx = makeTx({ status: SlotStatus.FULL });
      await expect(service.assignOrderToSlot(ORDER_ID, SLOT_ID, tx as never))
        .rejects.toThrow(ConflictException);
    });

    it('throws ConflictException when conditional updateMany affects 0 rows (race)', async () => {
      const tx = makeTx();
      tx._slotUpdateMany.mockResolvedValue({ count: 0 });
      await expect(service.assignOrderToSlot(ORDER_ID, SLOT_ID, tx as never))
        .rejects.toThrow(ConflictException);
    });
  });
});
