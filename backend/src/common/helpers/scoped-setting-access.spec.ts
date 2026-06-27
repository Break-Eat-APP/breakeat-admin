import { ForbiddenException } from '@nestjs/common';
import { FlagScope } from '@prisma/client';
import { requireScopedAccess, filterScopedRows } from './scoped-setting-access';
import type { PrismaService } from '../../database/prisma.service';

// Mock minimal de Prisma pour les chemins d'autorisation.
function buildPrisma(opts: {
  globalRole?: string;
  membership?: { orgRole: string } | null;
  eventOrgId?: string | null;
}): PrismaService {
  return {
    user: { findUnique: jest.fn().mockResolvedValue({ globalRole: opts.globalRole ?? 'CUSTOMER' }) },
    organizationMember: {
      findUnique: jest.fn().mockResolvedValue(opts.membership ?? null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    event: {
      findUnique: jest.fn().mockResolvedValue(opts.eventOrgId ? { organizationId: opts.eventOrgId } : null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  } as unknown as PrismaService;
}

describe('requireScopedAccess', () => {
  it('GLOBAL write: refusé pour non super-admin', async () => {
    const prisma = buildPrisma({ globalRole: 'CUSTOMER' });
    await expect(requireScopedAccess(prisma, 'u1', FlagScope.GLOBAL, null, 'write')).rejects.toThrow(ForbiddenException);
  });

  it('GLOBAL write: autorisé pour SUPER_ADMIN', async () => {
    const prisma = buildPrisma({ globalRole: 'SUPER_ADMIN' });
    await expect(requireScopedAccess(prisma, 'u1', FlagScope.GLOBAL, null, 'write')).resolves.toBeUndefined();
  });

  it('GLOBAL read: autorisé pour tout membre authentifié', async () => {
    const prisma = buildPrisma({ globalRole: 'CUSTOMER' });
    await expect(requireScopedAccess(prisma, 'u1', FlagScope.GLOBAL, null, 'read')).resolves.toBeUndefined();
  });

  it('ORGANIZATION write: refusé pour non-membre', async () => {
    const prisma = buildPrisma({ globalRole: 'CUSTOMER', membership: null });
    await expect(requireScopedAccess(prisma, 'u1', FlagScope.ORGANIZATION, 'org1', 'write')).rejects.toThrow(ForbiddenException);
  });

  it('ORGANIZATION write: autorisé pour MANAGER', async () => {
    const prisma = buildPrisma({ globalRole: 'CUSTOMER', membership: { orgRole: 'MANAGER' } });
    await expect(requireScopedAccess(prisma, 'u1', FlagScope.ORGANIZATION, 'org1', 'write')).resolves.toBeUndefined();
  });

  it('ORGANIZATION write: refusé pour OPERATOR (pas MANAGE_ROLES)', async () => {
    const prisma = buildPrisma({ globalRole: 'CUSTOMER', membership: { orgRole: 'OPERATOR' } });
    await expect(requireScopedAccess(prisma, 'u1', FlagScope.ORGANIZATION, 'org1', 'write')).rejects.toThrow(ForbiddenException);
  });

  it('EVENT write: résout l\'org puis applique les droits', async () => {
    const prisma = buildPrisma({ globalRole: 'CUSTOMER', membership: { orgRole: 'ORG_ADMIN' }, eventOrgId: 'org1' });
    await expect(requireScopedAccess(prisma, 'u1', FlagScope.EVENT, 'evt1', 'write')).resolves.toBeUndefined();
  });
});

describe('filterScopedRows', () => {
  it('SUPER_ADMIN voit toutes les lignes', async () => {
    const prisma = buildPrisma({ globalRole: 'SUPER_ADMIN' });
    const rows = [{ scope: FlagScope.ORGANIZATION, scopeId: 'other-org' }];
    await expect(filterScopedRows(prisma, 'u1', rows)).resolves.toEqual(rows);
  });

  it('un membre ne voit que GLOBAL + ses orgs', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ globalRole: 'CUSTOMER' }) },
      organizationMember: { findMany: jest.fn().mockResolvedValue([{ organizationId: 'org1' }]) },
      event: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;
    const rows = [
      { scope: FlagScope.GLOBAL, scopeId: null },
      { scope: FlagScope.ORGANIZATION, scopeId: 'org1' },
      { scope: FlagScope.ORGANIZATION, scopeId: 'org2' },
    ];
    const out = await filterScopedRows(prisma, 'u1', rows);
    expect(out).toEqual([
      { scope: FlagScope.GLOBAL, scopeId: null },
      { scope: FlagScope.ORGANIZATION, scopeId: 'org1' },
    ]);
  });
});
