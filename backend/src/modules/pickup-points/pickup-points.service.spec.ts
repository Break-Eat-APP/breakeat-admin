import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PickupPointStatus } from '@prisma/client';
import { PickupPointsService } from './pickup-points.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const VENUE_ID = 'venue-1';
const OTHER_VENUE_ID = 'venue-2';
const EVENT_ID = 'event-1';

function mockMember() {
  return { userId: USER_ID, organizationId: ORG_ID, orgRole: 'ORG_ADMIN' };
}

function mockVenue() {
  return { id: VENUE_ID, organizationId: ORG_ID };
}

function mockEvent(venueId = VENUE_ID) {
  return { id: EVENT_ID, organizationId: ORG_ID, venueId };
}

// ─── Tests ────────────────────────────────────────────────────

describe('PickupPointsService', () => {
  let service: PickupPointsService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PickupPointsService,
        {
          provide: PrismaService,
          useValue: {
            // requireOrgAccess queries user.globalRole first
            user: { findUnique: jest.fn() },
            organizationMember: { findUnique: jest.fn() },
            venue: { findFirst: jest.fn() },
            event: { findFirst: jest.fn() },
            supplier: { findFirst: jest.fn() },
            pickupPoint: {
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<PickupPointsService>(PickupPointsService);
    prisma = module.get(PrismaService);
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('creates a pickup point when venue and event match', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.venue.findFirst as jest.Mock).mockResolvedValue(mockVenue());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent(VENUE_ID));
      const created = {
        id: 'pp-1',
        organizationId: ORG_ID,
        venueId: VENUE_ID,
        eventId: EVENT_ID,
        supplierId: null,
        name: 'Zone A',
        status: PickupPointStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (prisma.pickupPoint.create as jest.Mock).mockResolvedValue(created);

      const result = await service.create(ORG_ID, USER_ID, {
        venueId: VENUE_ID,
        eventId: EVENT_ID,
        name: 'Zone A',
        status: PickupPointStatus.ACTIVE,
      });

      expect(result).toEqual(created);
    });

    it('creates a pickup point without an event (no venue cross-check)', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.venue.findFirst as jest.Mock).mockResolvedValue(mockVenue());
      const created = {
        id: 'pp-2',
        organizationId: ORG_ID,
        venueId: VENUE_ID,
        eventId: null,
        supplierId: null,
        name: 'General Zone',
        status: PickupPointStatus.ACTIVE,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      (prisma.pickupPoint.create as jest.Mock).mockResolvedValue(created);

      const result = await service.create(ORG_ID, USER_ID, {
        venueId: VENUE_ID,
        name: 'General Zone',
      });

      expect(result).toEqual(created);
      expect(prisma.event.findFirst).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when dto.venueId does not match event.venueId', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.venue.findFirst as jest.Mock).mockResolvedValue({ id: OTHER_VENUE_ID, organizationId: ORG_ID });
      // Event is in VENUE_ID, but dto.venueId = OTHER_VENUE_ID
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(mockEvent(VENUE_ID));

      await expect(
        service.create(ORG_ID, USER_ID, {
          venueId: OTHER_VENUE_ID,
          eventId: EVENT_ID,
          name: 'Wrong Zone',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when venue is not in this org', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.venue.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, USER_ID, { venueId: 'wrong-venue', name: 'Zone' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when event is not in this org', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.venue.findFirst as jest.Mock).mockResolvedValue(mockVenue());
      (prisma.event.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, USER_ID, {
          venueId: VENUE_ID,
          eventId: 'wrong-event',
          name: 'Zone',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
