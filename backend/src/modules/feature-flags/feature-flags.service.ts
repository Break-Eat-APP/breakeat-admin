import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FlagScope, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { requireScopedAccess, filterScopedRows } from '../../common/helpers/scoped-setting-access';
import type { SetFeatureFlagDto } from './dto/set-feature-flag.dto';

/**
 * FeatureFlagsService — enables / disables features per scope without redeploy.
 *
 * Resolution precedence (resolve method):
 *   EVENT > ORGANIZATION > GLOBAL
 *
 * A flag not found at a given scope falls through to the next broader scope.
 * If no record exists at any scope, the flag is considered disabled (false).
 *
 * Storage: `feature_flags` table (see schema.prisma Phase 9).
 */
@Injectable()
export class FeatureFlagsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve a feature flag for a given context.
   * Precedence: EVENT → ORGANIZATION → GLOBAL → false (not found)
   *
   * Autorisation (Codex P2) : quand `userId` est fourni (appel via l'API HTTP),
   * on vérifie l'accès en lecture à la portée la plus spécifique demandée afin de
   * ne pas exposer l'état des flags d'une autre org à qui devine son UUID. Les
   * appels internes (sans `userId`) restent libres.
   */
  async resolve(
    key: string,
    context: { orgId?: string; eventId?: string } = {},
    userId?: string,
  ): Promise<boolean> {
    const { orgId, eventId } = context;

    if (userId) {
      if (eventId) {
        await requireScopedAccess(this.prisma, userId, FlagScope.EVENT, eventId, 'read');
      } else if (orgId) {
        await requireScopedAccess(this.prisma, userId, FlagScope.ORGANIZATION, orgId, 'read');
      }
      // Sans orgId/eventId : résolution GLOBALE uniquement, lisible par tout membre authentifié.
    }

    // 1. Event-scoped flag (most specific)
    if (eventId) {
      const flag = await this.prisma.featureFlag.findUnique({
        where: { key_scope_scopeId: { key, scope: FlagScope.EVENT, scopeId: eventId } },
        select: { enabled: true },
      });
      if (flag !== null) return flag.enabled;
    }

    // 2. Organization-scoped flag
    if (orgId) {
      const flag = await this.prisma.featureFlag.findUnique({
        where: { key_scope_scopeId: { key, scope: FlagScope.ORGANIZATION, scopeId: orgId } },
        select: { enabled: true },
      });
      if (flag !== null) return flag.enabled;
    }

    // 3. Global flag (least specific)
    // scopeId: null is explicit — defensive against rows with scope=GLOBAL but scopeId≠null
    const global = await this.prisma.featureFlag.findFirst({
      where: { key, scope: FlagScope.GLOBAL, scopeId: null },
      select: { enabled: true },
    });
    return global?.enabled ?? false;
  }

  /**
   * List all flags, optionally filtered by scope / scopeId.
   */
  async list(
    scope?: FlagScope,
    scopeId?: string,
    userId?: string,
  ) {
    const rows = await this.prisma.featureFlag.findMany({
      where: {
        ...(scope !== undefined ? { scope } : {}),
        ...(scopeId !== undefined ? { scopeId } : {}),
      },
      orderBy: [{ scope: 'asc' }, { key: 'asc' }],
    });
    return userId ? filterScopedRows(this.prisma, userId, rows) : rows;
  }

  /**
   * Create or update a feature flag (upsert by key + scope + scopeId).
   *
   * Cross-field rules enforced here:
   *   - scope === GLOBAL  → scopeId must be absent
   *   - scope !== GLOBAL  → scopeId must be provided
   */
  async set(dto: SetFeatureFlagDto, userId?: string) {
    const { key, scope, scopeId, enabled, metadata } = dto;

    if (userId) await requireScopedAccess(this.prisma, userId, scope, scopeId, 'write');

    if (scope === FlagScope.GLOBAL && scopeId) {
      throw new BadRequestException('scopeId must not be set when scope is GLOBAL');
    }
    if (scope !== FlagScope.GLOBAL && !scopeId) {
      throw new BadRequestException('scopeId is required when scope is ORGANIZATION or EVENT');
    }

    // scopeId is null for GLOBAL flags. Cast needed because Prisma's generated
    // compound-unique where type lists the nullable field as string (not string|null).
    const sid = (scopeId ?? null) as string;
    return this.prisma.featureFlag.upsert({
      where: { key_scope_scopeId: { key, scope, scopeId: sid } },
      create: { key, scope, scopeId: sid, enabled, metadata: metadata as Prisma.InputJsonValue },
      update: { enabled, metadata: metadata as Prisma.InputJsonValue },
    });
  }

  /**
   * Delete a feature flag by id.
   * Throws NotFoundException if not found (mirrors AppSettingsService pattern).
   */
  async remove(id: string, userId?: string) {
    const existing = await this.prisma.featureFlag.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`FeatureFlag ${id} not found`);
    if (userId) await requireScopedAccess(this.prisma, userId, existing.scope, existing.scopeId, 'write');
    return this.prisma.featureFlag.delete({ where: { id } });
  }
}
