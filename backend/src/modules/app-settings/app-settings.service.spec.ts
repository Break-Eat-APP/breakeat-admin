import { Test } from '@nestjs/testing';
import { FlagScope } from '@prisma/client';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppSettingsService } from './app-settings.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Prisma mock ─────────────────────────────────────────────────

const prisma = {
  appSetting: {
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
const SETTING_ID = 'setting-uuid';

function makeSetting(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: SETTING_ID,
    key: 'banner_message',
    scope: FlagScope.GLOBAL,
    scopeId: null,
    value: 'Welcome to Break Eat!',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Suite ───────────────────────────────────────────────────────

describe('AppSettingsService', () => {
  let service: AppSettingsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        AppSettingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AppSettingsService);
  });

  // ─── get ──────────────────────────────────────────────────────

  describe('get', () => {
    it('returns the global setting value when no context given', async () => {
      (prisma.appSetting.findFirst as jest.Mock).mockResolvedValue({ value: 'Hello World' });

      const result = await service.get('banner_message');

      expect(result).toBe('Hello World');
    });

    it('returns null when no setting found at any scope', async () => {
      (prisma.appSetting.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.appSetting.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.get('missing_key', { orgId: ORG_ID, eventId: EVT_ID });

      expect(result).toBeNull();
    });

    it('event scope takes priority over org and global', async () => {
      (prisma.appSetting.findUnique as jest.Mock)
        .mockResolvedValueOnce({ value: 'Event override' }); // EVENT hit

      const result = await service.get('banner_message', { orgId: ORG_ID, eventId: EVT_ID });

      expect(result).toBe('Event override');
      expect(prisma.appSetting.findUnique).toHaveBeenCalledTimes(1);
    });

    it('falls through to org when event setting not found', async () => {
      (prisma.appSetting.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)                   // EVENT: not found
        .mockResolvedValueOnce({ value: 'Org value' }); // ORG: found

      const result = await service.get('banner_message', { orgId: ORG_ID, eventId: EVT_ID });

      expect(result).toBe('Org value');
      expect(prisma.appSetting.findFirst).not.toHaveBeenCalled();
    });
  });

  // ─── list ─────────────────────────────────────────────────────

  describe('list', () => {
    it('returns all settings when no filter provided', async () => {
      (prisma.appSetting.findMany as jest.Mock).mockResolvedValue([makeSetting()]);

      const result = await service.list();

      expect(result).toHaveLength(1);
    });

    it('passes scope and scopeId to Prisma where clause', async () => {
      (prisma.appSetting.findMany as jest.Mock).mockResolvedValue([]);

      await service.list(FlagScope.EVENT, EVT_ID);

      const callArg = (prisma.appSetting.findMany as jest.Mock).mock.calls[0][0];
      expect(callArg.where.scope).toBe(FlagScope.EVENT);
      expect(callArg.where.scopeId).toBe(EVT_ID);
    });
  });

  // ─── set ──────────────────────────────────────────────────────

  describe('set', () => {
    it('upserts a global setting', async () => {
      const setting = makeSetting({ value: 42 });
      (prisma.appSetting.upsert as jest.Mock).mockResolvedValue(setting);

      const result = await service.set({
        key: 'banner_message',
        scope: FlagScope.GLOBAL,
        value: 'Hello World',
      });

      expect(result.key).toBe('banner_message');
      expect(prisma.appSetting.upsert).toHaveBeenCalledTimes(1);
    });

    it('upserts an event-scoped setting', async () => {
      const setting = makeSetting({ scope: FlagScope.EVENT, scopeId: EVT_ID });
      (prisma.appSetting.upsert as jest.Mock).mockResolvedValue(setting);

      await service.set({
        key: 'event_description',
        scope: FlagScope.EVENT,
        scopeId: EVT_ID,
        value: 'Rock festival 2026',
      });

      const callArg = (prisma.appSetting.upsert as jest.Mock).mock.calls[0][0];
      expect(callArg.create.scopeId).toBe(EVT_ID);
      expect(callArg.create.value).toBe('Rock festival 2026');
    });

    it('throws BadRequestException when scope=GLOBAL and scopeId is provided', async () => {
      await expect(
        service.set({ key: 's', scope: FlagScope.GLOBAL, scopeId: ORG_ID, value: 'x' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when scope=EVENT and scopeId is missing', async () => {
      await expect(
        service.set({ key: 's', scope: FlagScope.EVENT, value: 'x' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.appSetting.upsert).not.toHaveBeenCalled();
    });
  });

  // ─── remove ───────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes the setting by id', async () => {
      (prisma.appSetting.findUnique as jest.Mock).mockResolvedValue(makeSetting());
      (prisma.appSetting.delete as jest.Mock).mockResolvedValue(makeSetting());

      await service.remove(SETTING_ID);

      expect(prisma.appSetting.delete).toHaveBeenCalledWith({ where: { id: SETTING_ID } });
    });

    it('throws NotFoundException when setting does not exist', async () => {
      (prisma.appSetting.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.remove(SETTING_ID)).rejects.toThrow(NotFoundException);
      expect(prisma.appSetting.delete).not.toHaveBeenCalled();
    });
  });
});
