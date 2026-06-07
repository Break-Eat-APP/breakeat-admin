import { Test } from '@nestjs/testing';
import { FlagScope } from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Prisma mock ─────────────────────────────────────────────────

const prisma = {
  featureFlag: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
  },
};

// ─── Helpers ─────────────────────────────────────────────────────

const ORG_ID  = 'org-uuid';
const EVT_ID  = 'evt-uuid';
const FLAG_ID = 'flag-uuid';

function makeFlag(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: FLAG_ID,
    key: 'my_feature',
    scope: FlagScope.GLOBAL,
    scopeId: null,
    enabled: true,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Suite ───────────────────────────────────────────────────────

describe('FeatureFlagsService', () => {
  let service: FeatureFlagsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        FeatureFlagsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(FeatureFlagsService);
  });

  // ─── resolve ─────────────────────────────────────────────────

  describe('resolve', () => {
    it('returns true for a matching GLOBAL flag', async () => {
      (prisma.featureFlag.findFirst as jest.Mock).mockResolvedValue({ enabled: true });

      const result = await service.resolve('my_feature');

      expect(result).toBe(true);
    });

    it('returns false when no flag exists at any scope', async () => {
      (prisma.featureFlag.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.featureFlag.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.resolve('unknown_flag', { orgId: ORG_ID, eventId: EVT_ID });

      expect(result).toBe(false);
    });

    it('event scope takes priority over org scope', async () => {
      // EVENT flag disabled, ORG flag enabled — EVENT should win
      (prisma.featureFlag.findUnique as jest.Mock)
        .mockResolvedValueOnce({ enabled: false }) // EVENT flag
        .mockResolvedValue({ enabled: true });      // ORG flag (should NOT be reached)

      const result = await service.resolve('my_feature', { orgId: ORG_ID, eventId: EVT_ID });

      expect(result).toBe(false);
      // Only one findUnique call (event scope) — stopped early
      expect(prisma.featureFlag.findUnique).toHaveBeenCalledTimes(1);
    });

    it('falls through to org scope when event flag not found', async () => {
      // EVENT not found → ORG found enabled
      (prisma.featureFlag.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)               // EVENT: not found
        .mockResolvedValueOnce({ enabled: true }); // ORG: found

      const result = await service.resolve('my_feature', { orgId: ORG_ID, eventId: EVT_ID });

      expect(result).toBe(true);
      expect(prisma.featureFlag.findFirst).not.toHaveBeenCalled();
    });

    it('falls through to global scope when event and org not found', async () => {
      (prisma.featureFlag.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.featureFlag.findFirst as jest.Mock).mockResolvedValue({ enabled: true });

      const result = await service.resolve('my_feature', { orgId: ORG_ID, eventId: EVT_ID });

      expect(result).toBe(true);
    });

    it('skips event lookup when eventId not provided', async () => {
      (prisma.featureFlag.findUnique as jest.Mock).mockResolvedValue({ enabled: true });

      await service.resolve('my_feature', { orgId: ORG_ID });

      // Only 1 call for ORG scope (no EVENT lookup)
      expect(prisma.featureFlag.findUnique).toHaveBeenCalledTimes(1);
      const callArgs = (prisma.featureFlag.findUnique as jest.Mock).mock.calls[0][0];
      expect(callArgs.where.key_scope_scopeId.scope).toBe(FlagScope.ORGANIZATION);
    });
  });

  // ─── list ─────────────────────────────────────────────────────

  describe('list', () => {
    it('returns all flags when no filter provided', async () => {
      const flags = [makeFlag(), makeFlag({ id: 'f2', scope: FlagScope.ORGANIZATION, scopeId: ORG_ID })];
      (prisma.featureFlag.findMany as jest.Mock).mockResolvedValue(flags);

      const result = await service.list();

      expect(result).toHaveLength(2);
    });

    it('passes scope and scopeId filters to Prisma', async () => {
      (prisma.featureFlag.findMany as jest.Mock).mockResolvedValue([]);

      await service.list(FlagScope.ORGANIZATION, ORG_ID);

      const callArg = (prisma.featureFlag.findMany as jest.Mock).mock.calls[0][0];
      expect(callArg.where.scope).toBe(FlagScope.ORGANIZATION);
      expect(callArg.where.scopeId).toBe(ORG_ID);
    });
  });

  // ─── set ──────────────────────────────────────────────────────

  describe('set', () => {
    it('upserts a global flag', async () => {
      const flag = makeFlag();
      (prisma.featureFlag.upsert as jest.Mock).mockResolvedValue(flag);

      const result = await service.set({
        key: 'my_feature',
        scope: FlagScope.GLOBAL,
        enabled: true,
      });

      expect(result.key).toBe('my_feature');
      expect(prisma.featureFlag.upsert).toHaveBeenCalledTimes(1);
    });

    it('upserts an event-scoped flag', async () => {
      const flag = makeFlag({ scope: FlagScope.EVENT, scopeId: EVT_ID });
      (prisma.featureFlag.upsert as jest.Mock).mockResolvedValue(flag);

      await service.set({
        key: 'my_feature',
        scope: FlagScope.EVENT,
        scopeId: EVT_ID,
        enabled: false,
      });

      const callArg = (prisma.featureFlag.upsert as jest.Mock).mock.calls[0][0];
      expect(callArg.create.scopeId).toBe(EVT_ID);
    });

    it('throws BadRequestException when scope=GLOBAL and scopeId is provided', async () => {
      await expect(
        service.set({ key: 'f', scope: FlagScope.GLOBAL, scopeId: ORG_ID, enabled: true }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.featureFlag.upsert).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when scope=ORGANIZATION and scopeId is missing', async () => {
      await expect(
        service.set({ key: 'f', scope: FlagScope.ORGANIZATION, enabled: true }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.featureFlag.upsert).not.toHaveBeenCalled();
    });
  });

  // ─── remove ───────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes the flag by id', async () => {
      (prisma.featureFlag.findUnique as jest.Mock).mockResolvedValue(makeFlag());
      (prisma.featureFlag.delete as jest.Mock).mockResolvedValue(makeFlag());

      await service.remove(FLAG_ID);

      expect(prisma.featureFlag.delete).toHaveBeenCalledWith({ where: { id: FLAG_ID } });
    });

    it('throws NotFoundException when flag does not exist', async () => {
      (prisma.featureFlag.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.remove(FLAG_ID)).rejects.toThrow(NotFoundException);
      expect(prisma.featureFlag.delete).not.toHaveBeenCalled();
    });
  });
});
