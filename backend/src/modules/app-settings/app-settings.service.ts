import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FlagScope, Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { requireScopedAccess, filterScopedRows } from '../../common/helpers/scoped-setting-access';
import type { SetAppSettingDto } from './dto/set-app-setting.dto';

/**
 * AppSettingsService — JSON key-value store for CMS / app configuration.
 *
 * Typical use-cases:
 *   - Email header text (`email_header_text`)
 *   - Banner message (`banner_message`)
 *   - Event description (`event_description`)
 *   - Max orders per slot (`max_orders_per_slot`)
 *   - Payment provider label (`payment_provider_label`)
 *
 * Scope resolution (get): EVENT → ORGANIZATION → GLOBAL → null (not found)
 * Same precedence as FeatureFlagsService.
 */
@Injectable()
export class AppSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get the most specific setting value for a key + context.
   * Precedence: EVENT → ORGANIZATION → GLOBAL → null
   */
  async get(
    key: string,
    context: { orgId?: string; eventId?: string } = {},
    userId?: string,
  ): Promise<Prisma.JsonValue | null> {
    const { orgId, eventId } = context;

    // Autorisation lecture sur le contexte le plus spécifique fourni.
    if (userId) {
      if (eventId) await requireScopedAccess(this.prisma, userId, FlagScope.EVENT, eventId, 'read');
      else if (orgId) await requireScopedAccess(this.prisma, userId, FlagScope.ORGANIZATION, orgId, 'read');
    }

    if (eventId) {
      const s = await this.prisma.appSetting.findUnique({
        where: { key_scope_scopeId: { key, scope: FlagScope.EVENT, scopeId: eventId } },
        select: { value: true },
      });
      if (s !== null) return s.value;
    }

    if (orgId) {
      const s = await this.prisma.appSetting.findUnique({
        where: { key_scope_scopeId: { key, scope: FlagScope.ORGANIZATION, scopeId: orgId } },
        select: { value: true },
      });
      if (s !== null) return s.value;
    }

    // scopeId: null explicit — defensive against rows with scope=GLOBAL but scopeId≠null
    const global = await this.prisma.appSetting.findFirst({
      where: { key, scope: FlagScope.GLOBAL, scopeId: null },
      select: { value: true },
    });
    return global?.value ?? null;
  }

  /**
   * List all settings, optionally filtered by scope / scopeId.
   */
  async list(scope?: FlagScope, scopeId?: string, userId?: string) {
    const rows = await this.prisma.appSetting.findMany({
      where: {
        ...(scope !== undefined ? { scope } : {}),
        ...(scopeId !== undefined ? { scopeId } : {}),
      },
      orderBy: [{ scope: 'asc' }, { key: 'asc' }],
    });
    // Filtrage par droits : un membre ne voit que GLOBAL + ses orgs/événements.
    return userId ? filterScopedRows(this.prisma, userId, rows) : rows;
  }

  /**
   * Create or update a setting (upsert by key + scope + scopeId).
   *
   * Cross-field rules:
   *   - scope === GLOBAL  → scopeId must be absent
   *   - scope !== GLOBAL  → scopeId must be provided
   */
  async set(dto: SetAppSettingDto, userId?: string) {
    const { key, scope, scopeId, value } = dto;

    if (userId) await requireScopedAccess(this.prisma, userId, scope, scopeId, 'write');

    if (scope === FlagScope.GLOBAL && scopeId) {
      throw new BadRequestException('scopeId must not be set when scope is GLOBAL');
    }
    if (scope !== FlagScope.GLOBAL && !scopeId) {
      throw new BadRequestException('scopeId is required when scope is ORGANIZATION or EVENT');
    }
    // Cast: Prisma's generated compound-unique where type lists nullable field as string.
    const sid = (scopeId ?? null) as string;
    return this.prisma.appSetting.upsert({
      where: { key_scope_scopeId: { key, scope, scopeId: sid } },
      create: { key, scope, scopeId: sid, value: value as Prisma.InputJsonValue },
      update: { value: value as Prisma.InputJsonValue },
    });
  }

  /**
   * Delete a setting by id.
   * Throws NotFoundException if not found.
   */
  async remove(id: string, userId?: string) {
    const existing = await this.prisma.appSetting.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException(`AppSetting ${id} not found`);
    if (userId) await requireScopedAccess(this.prisma, userId, existing.scope, existing.scopeId, 'write');
    return this.prisma.appSetting.delete({ where: { id } });
  }
}
