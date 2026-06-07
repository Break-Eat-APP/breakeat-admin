import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventStatus, EventVisibility } from '@prisma/client';
import { EventsService } from './events.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const EVENT_ID = 'event-1';
const VENUE_ID = 'venue-1';
const SUPPLIER_ID = 'supplier-1';

function mockEvent(
  overrides: Partial<{ status: EventStatus; visibility: EventVisibility }> = {},
) {
  return {
    id: EVENT_ID,
    organizationId: ORG_ID,
    venueId: VENUE_ID,
    name: 'Test Event',
    startAt: new Date('2026-06-01T09:00:00Z'),
    endAt: new Date('2026-06-01T18:00:00Z'),
    status: EventStatus.DRAFT,
    visibility: EventVisibility.PUBLIC,
    activeFeatureFlags: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function mockMember(orgRole = 'ORG_ADMIN') {
  return { userId: USER_ID, organizationId: ORG_ID, orgRole };
}

// ─── Tests ────────────────────────────────────────────────────

describe('EventsService', () => {
  let service: EventsService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsService,
        {
          provide: PrismaService,
          useValue: {
            // requireOrgAccess now queries user.globalRole first
            user: { findUnique: jest.fn() },
            organizationMember: { findUnique: jest.fn() },
            venue: { findFirst: jest.fn() },
            event: {
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
            supplier: { findFirst: jest.fn() },
            eventSupplier: {
              findUnique: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
            },
            // Phase 14.7 — group access wiring
            group: { count: jest.fn() },
            eventGroup: { deleteMany: jest.fn(), createMany: jest.fn() },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EventsService>(EventsService);
    prisma = module.get(PrismaService);
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('creates an event when caller is ORG_ADMIN and venue belongs to org', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.venue.findFirst as jest.Mock).mockResolvedValue({ id: VENUE_ID });
      const created = mockEvent();
      (prisma.event.create as jest.Mock).mockResolvedValue(created);

      const result = await service.create(ORG_ID, USER_ID, {
        venueId: VENUE_ID,
        name: 'Test Event',
        startAt: '2026-06-01T09:00:00Z',
        endAt: '2026-06-01T18:00:00Z',
      });

      expect(result).toEqual(created);
      expect(prisma.event.create).toHaveBeenCalledTimes(1);
    });

    it('throws ForbiddenException when caller is not an org member', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, USER_ID, {
          venueId: VENUE_ID,
          name: 'Test Event',
          startAt: '2026-06-01T09:00:00Z',
          endAt: '2026-06-01T18:00:00Z',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when venue does not belong to org', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.venue.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, USER_ID, {
          venueId: 'wrong-venue',
          name: 'Test Event',
          startAt: '2026-06-01T09:00:00Z',
          endAt: '2026-06-01T18:00:00Z',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when endAt <= startAt', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.venue.findFirst as jest.Mock).mockResolvedValue({ id: VENUE_ID });

      await expect(
        service.create(ORG_ID, USER_ID, {
          venueId: VENUE_ID,
          name: 'Test Event',
          startAt: '2026-06-01T18:00:00Z',
          endAt: '2026-06-01T09:00:00Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── update (Phase 14.7 — visibility + group access) ─────────

  describe('update', () => {
    it('sets event visibility to PRIVATE', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent());
      const updated = mockEvent({ visibility: EventVisibility.PRIVATE });
      (prisma.event.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.update(ORG_ID, EVENT_ID, USER_ID, {
        visibility: EventVisibility.PRIVATE,
      });

      expect(result.visibility).toBe(EventVisibility.PRIVATE);
      expect(prisma.event.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: EVENT_ID },
          data: expect.objectContaining({ visibility: EventVisibility.PRIVATE }),
        }),
      );
      // No group set provided → must not touch the join table.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.eventGroup.deleteMany).not.toHaveBeenCalled();
    });

    it('replaces the event group set when groupIds are provided', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent());
      // Both groups belong to the org.
      (prisma.group.count as jest.Mock).mockResolvedValue(2);
      (prisma.event.update as jest.Mock).mockResolvedValue(
        mockEvent({ visibility: EventVisibility.PRIVATE }),
      );
      (prisma.eventGroup.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
      (prisma.eventGroup.createMany as jest.Mock).mockResolvedValue({ count: 2 });
      // Run the transaction callback against the same prisma mock.
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(prisma));

      await service.update(ORG_ID, EVENT_ID, USER_ID, {
        visibility: EventVisibility.PRIVATE,
        groupIds: ['group-1', 'group-2'],
      });

      expect(prisma.group.count).toHaveBeenCalledWith({
        where: { id: { in: ['group-1', 'group-2'] }, organizationId: ORG_ID },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.eventGroup.deleteMany).toHaveBeenCalledWith({
        where: { eventId: EVENT_ID },
      });
      expect(prisma.eventGroup.createMany).toHaveBeenCalledWith({
        data: [
          { eventId: EVENT_ID, groupId: 'group-1' },
          { eventId: EVENT_ID, groupId: 'group-2' },
        ],
        skipDuplicates: true,
      });
    });

    it('clears all group links when groupIds is an empty array', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.event.update as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.eventGroup.deleteMany as jest.Mock).mockResolvedValue({ count: 3 });
      (prisma.$transaction as jest.Mock).mockImplementation(async (cb) => cb(prisma));

      await service.update(ORG_ID, EVENT_ID, USER_ID, { groupIds: [] });

      // Empty set: no ownership check needed, wipe links, create nothing.
      expect(prisma.group.count).not.toHaveBeenCalled();
      expect(prisma.eventGroup.deleteMany).toHaveBeenCalledWith({
        where: { eventId: EVENT_ID },
      });
      expect(prisma.eventGroup.createMany).not.toHaveBeenCalled();
    });

    it('rejects groupIds that do not all belong to the org', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent());
      // Only 1 of the 2 requested groups is owned by this org.
      (prisma.group.count as jest.Mock).mockResolvedValue(1);

      await expect(
        service.update(ORG_ID, EVENT_ID, USER_ID, {
          groupIds: ['group-1', 'foreign-group'],
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.eventGroup.deleteMany).not.toHaveBeenCalled();
    });
  });

  // ─── updateStatus ────────────────────────────────────────────

  describe('updateStatus', () => {
    it('transitions DRAFT → ACTIVE', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent({ status: EventStatus.DRAFT }));
      const updated = mockEvent({ status: EventStatus.ACTIVE });
      (prisma.event.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.updateStatus(ORG_ID, EVENT_ID, USER_ID, {
        status: EventStatus.ACTIVE,
      });

      expect(result.status).toBe(EventStatus.ACTIVE);
    });

    it('rejects invalid transition ENDED → ACTIVE', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent({ status: EventStatus.ENDED }));

      await expect(
        service.updateStatus(ORG_ID, EVENT_ID, USER_ID, { status: EventStatus.ACTIVE }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects any modification on a CANCELLED event', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(
        mockEvent({ status: EventStatus.CANCELLED }),
      );

      await expect(
        service.updateStatus(ORG_ID, EVENT_ID, USER_ID, { status: EventStatus.ACTIVE }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── attachSupplier ──────────────────────────────────────────

  describe('attachSupplier', () => {
    it('attaches a supplier to an event', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue({ id: SUPPLIER_ID });
      (prisma.eventSupplier.findUnique as jest.Mock).mockResolvedValue(null);
      const es = { id: 'es-1', eventId: EVENT_ID, supplierId: SUPPLIER_ID, createdAt: new Date() };
      (prisma.eventSupplier.create as jest.Mock).mockResolvedValue(es);

      const result = await service.attachSupplier(ORG_ID, EVENT_ID, SUPPLIER_ID, USER_ID);
      expect(result).toEqual(es);
    });

    it('throws ConflictException when supplier already attached', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue({ id: SUPPLIER_ID });
      (prisma.eventSupplier.findUnique as jest.Mock).mockResolvedValue({ id: 'existing' });

      await expect(
        service.attachSupplier(ORG_ID, EVENT_ID, SUPPLIER_ID, USER_ID),
      ).rejects.toThrow(ConflictException);
    });
  });
});
