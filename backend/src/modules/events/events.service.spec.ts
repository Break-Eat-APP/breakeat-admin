import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventStatus } from '@prisma/client';
import { EventsService } from './events.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const EVENT_ID = 'event-1';
const VENUE_ID = 'venue-1';
const SUPPLIER_ID = 'supplier-1';

function mockEvent(overrides: Partial<{ status: EventStatus }> = {}) {
  return {
    id: EVENT_ID,
    organizationId: ORG_ID,
    venueId: VENUE_ID,
    name: 'Test Event',
    startAt: new Date('2026-06-01T09:00:00Z'),
    endAt: new Date('2026-06-01T18:00:00Z'),
    status: EventStatus.DRAFT,
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
