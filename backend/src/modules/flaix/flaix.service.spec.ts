import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FlaixDecisionType } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { FlaixService, SlotDecisionPayload, RushDecisionPayload } from './flaix.service';

// ─── Helpers ─────────────────────────────────────────────────

const EVENT_ID = 'event-1';
const SLOT_ID  = 'slot-1';

const makeSlotDecision = (overrides: Partial<SlotDecisionPayload> = {}): SlotDecisionPayload => ({
  decisionId:        'flaix-decision-1',
  type:              'slot_decision',
  eventId:           EVENT_ID,
  supplierId:        null,
  pickupPointId:     null,
  recommendedSlotId: SLOT_ID,
  reason:            'capacity',
  confidence:        0.92,
  createdAt:         new Date().toISOString(),
  ...overrides,
});

const makeRushDecision = (overrides: Partial<RushDecisionPayload> = {}): RushDecisionPayload => ({
  decisionId:         'flaix-rush-1',
  type:               'rush_decision',
  eventId:            EVENT_ID,
  rushScore:          75,
  severity:           'high',
  recommendedAction:  'slow_orders',
  createdAt:          new Date().toISOString(),
  ...overrides,
});

// ─── Suite ───────────────────────────────────────────────────

describe('FlaixService', () => {
  let service: FlaixService;
  let configGet: jest.Mock;
  let prismaFlaixCreate: jest.Mock;
  let prismaFlaixFindFirst: jest.Mock;
  let prismaFlaixFindMany: jest.Mock;

  function buildModule(apiUrl: string | null = null) {
    configGet = jest.fn((key: string) => {
      if (key === 'app.flaix.apiUrl') return apiUrl ?? '';
      if (key === 'app.flaix.apiKey') return apiUrl ? 'test-key' : '';
      return undefined;
    });

    prismaFlaixCreate    = jest.fn().mockResolvedValue({});
    prismaFlaixFindFirst = jest.fn().mockResolvedValue(null);
    prismaFlaixFindMany  = jest.fn().mockResolvedValue([]);

    return Test.createTestingModule({
      providers: [
        FlaixService,
        { provide: ConfigService, useValue: { get: configGet } },
        {
          provide: PrismaService,
          useValue: {
            flaixDecision: {
              create:    (a: unknown) => prismaFlaixCreate(a),
              findFirst: (a: unknown) => prismaFlaixFindFirst(a),
              findMany:  (a: unknown) => prismaFlaixFindMany(a),
            },
          },
        },
      ],
    }).compile();
  }

  // ─── isConfigured ─────────────────────────────────────────

  describe('isConfigured', () => {
    it('returns false when FLAIX_API_URL is not set', async () => {
      const m = await buildModule(null);
      service = m.get(FlaixService);
      expect(service.isConfigured()).toBe(false);
    });

    it('returns true when FLAIX_API_URL is set', async () => {
      const m = await buildModule('https://api.flaix.io');
      service = m.get(FlaixService);
      expect(service.isConfigured()).toBe(true);
    });
  });

  // ─── requestSlotDecision (stub) ────────────────────────────

  describe('requestSlotDecision', () => {
    it('returns null when Flaix is not configured', async () => {
      const m = await buildModule(null);
      service = m.get(FlaixService);
      const result = await service.requestSlotDecision(EVENT_ID);
      expect(result).toBeNull();
    });

    it('returns null from stub even when configured (Phase 7 stub)', async () => {
      const m = await buildModule('https://api.flaix.io');
      service = m.get(FlaixService);
      const result = await service.requestSlotDecision(EVENT_ID);
      expect(result).toBeNull(); // stub always returns null
    });
  });

  // ─── requestRushDecision (stub) ────────────────────────────

  describe('requestRushDecision', () => {
    it('returns null when Flaix is not configured', async () => {
      const m = await buildModule(null);
      service = m.get(FlaixService);
      const result = await service.requestRushDecision(EVENT_ID);
      expect(result).toBeNull();
    });
  });

  // ─── recordDecision ────────────────────────────────────────

  describe('recordDecision', () => {
    beforeEach(async () => {
      const m = await buildModule(null); // isConfigured doesn't matter for recordDecision
      service = m.get(FlaixService);
    });

    it('creates a SLOT_DECISION record in the database', async () => {
      const decision = makeSlotDecision();
      await service.recordDecision(decision, 'slot_assigned', ['order-1'], SLOT_ID);

      expect(prismaFlaixCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            decisionId:    'flaix-decision-1',
            type:          FlaixDecisionType.SLOT_DECISION,
            eventId:       EVENT_ID,
            slotId:        SLOT_ID,
            appliedAction: 'slot_assigned',
            affectedIds:   ['order-1'],
          }),
        }),
      );
    });

    it('creates a RUSH_DECISION record', async () => {
      const decision = makeRushDecision();
      await service.recordDecision(decision, 'slow_orders_applied', []);

      expect(prismaFlaixCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type:          FlaixDecisionType.RUSH_DECISION,
            appliedAction: 'slow_orders_applied',
          }),
        }),
      );
    });

    it('silently ignores duplicate decision (P2002 unique violation)', async () => {
      const uniqueErr = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      prismaFlaixCreate.mockRejectedValueOnce(uniqueErr);

      const decision = makeSlotDecision();
      // Should NOT throw
      await expect(
        service.recordDecision(decision, 'slot_assigned', []),
      ).resolves.toBeUndefined();
    });

    it('rethrows non-unique errors', async () => {
      prismaFlaixCreate.mockRejectedValueOnce(new Error('DB connection lost'));
      await expect(
        service.recordDecision(makeSlotDecision(), 'slot_assigned', []),
      ).rejects.toThrow('DB connection lost');
    });

    it('stores sourcePayload as raw JSON', async () => {
      const decision = makeSlotDecision({ confidence: 0.99 });
      await service.recordDecision(decision, 'slot_assigned', []);
      expect(prismaFlaixCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sourcePayload: expect.objectContaining({ confidence: 0.99 }),
          }),
        }),
      );
    });
  });

  // ─── getLatestRushDecision ─────────────────────────────────

  describe('getLatestRushDecision', () => {
    beforeEach(async () => {
      const m = await buildModule(null);
      service = m.get(FlaixService);
    });

    it('queries the latest RUSH_DECISION by eventId', async () => {
      await service.getLatestRushDecision(EVENT_ID);
      expect(prismaFlaixFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where:   { eventId: EVENT_ID, type: FlaixDecisionType.RUSH_DECISION },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  // ─── listDecisionsForEvent ─────────────────────────────────

  describe('listDecisionsForEvent', () => {
    beforeEach(async () => {
      const m = await buildModule(null);
      service = m.get(FlaixService);
    });

    it('returns all decisions for an event ordered by createdAt desc', async () => {
      await service.listDecisionsForEvent(EVENT_ID);
      expect(prismaFlaixFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where:   { eventId: EVENT_ID },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });
});
