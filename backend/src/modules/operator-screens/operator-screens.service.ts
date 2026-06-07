import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import {
  OperatorScreenKind,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import type {
  OperatorScreenTemplate,
  EventOperatorScreen,
} from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import {
  requireOrgAccess,
  MANAGE_ROLES,
  ALL_ORG_ROLES,
} from '../../common/helpers/require-org-access';
import type { CreateOperatorScreenDto } from './dto/create-operator-screen.dto';
import type { UpdateOperatorScreenDto } from './dto/update-operator-screen.dto';
import type { ApplyEventScreenDto } from './dto/apply-event-screen.dto';
import type { UpdateEventScreenDto } from './dto/update-event-screen.dto';

/** Known, persisted shape of a screen's fine-grained display filters. */
export interface ScreenFilters {
  /** Show only these categories (empty/absent ⇒ all). */
  categoryIds?: string[];
  /** Hide these categories. */
  excludeCategoryIds?: string[];
  /** Show only these products. */
  productIds?: string[];
  /** Hide these products. */
  excludeProductIds?: string[];
  /** Show the "Récap produits" aggregation panel alongside the screen. */
  showRecap?: boolean;
}

/** A screen ready for the operator board: conditions normalised + defaults filled. */
export interface ResolvedOperatorScreen {
  eventScreenId: string;
  templateId: string;
  name: string;
  kind: OperatorScreenKind;
  icon: string | null;
  sortOrder: number;
  enabled: boolean;
  slotKinds: OperatorScreenTemplate['slotKinds'];
  statuses: OrderStatus[];
  supplierIds: string[];
  filters: ScreenFilters;
}

/**
 * Default order statuses per screen kind, applied when a template leaves
 * `statuses` empty. Mirrors the named screens in the legacy operator product:
 *  - ORDERS_QUEUE → live prep pipeline ("Commandes Immédiates", "1ère mi-temps"…)
 *  - READY        → "Prêtes"
 *  - RECOVERED    → "récupérées"
 *  - GENERAL      → "Écran Général" (every active order)
 */
const DEFAULT_STATUSES: Record<OperatorScreenKind, OrderStatus[]> = {
  ORDERS_QUEUE: [OrderStatus.PAID, OrderStatus.ACCEPTED, OrderStatus.PREPARING],
  READY: [OrderStatus.READY],
  RECOVERED: [OrderStatus.PICKED_UP, OrderStatus.RECOVERED],
  GENERAL: [
    OrderStatus.PAID,
    OrderStatus.ACCEPTED,
    OrderStatus.PREPARING,
    OrderStatus.READY,
  ],
};

/**
 * OperatorScreensService — configurable, reusable operator-dashboard screens.
 *
 * Two layers:
 *  1. OperatorScreenTemplate — org-level, reusable screen definition.
 *  2. EventOperatorScreen     — applies a template to one event (per-event order
 *                               + enable toggle), so the same board config is
 *                               reused across matches without rebuilding it.
 *
 * Access (via requireOrgAccess; SUPER_ADMIN bypasses):
 *  - Read  (list, get, resolve): any org member (ALL_ORG_ROLES — operators included)
 *  - Write (create/update/delete, apply/reorder/remove): ORG_ADMIN or MANAGER
 *
 * `resolveForEvent` is the operator-board consumer: it mirrors the orders
 * dashboard's supplier-pinning (a pinned operator only sees their supplier's
 * screens) and returns screens with conditions normalised for client filtering.
 */
@Injectable()
export class OperatorScreensService {
  private readonly logger = new Logger(OperatorScreensService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Template CRUD (org-scoped) ───────────────────────────────

  async createTemplate(
    organizationId: string,
    userId: string,
    dto: CreateOperatorScreenDto,
  ): Promise<OperatorScreenTemplate> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const template = await this.prisma.operatorScreenTemplate.create({
      data: {
        organizationId,
        name: dto.name.trim(),
        kind: dto.kind ?? OperatorScreenKind.ORDERS_QUEUE,
        icon: dto.icon?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
        enabled: dto.enabled ?? true,
        slotKinds: dto.slotKinds ?? [],
        statuses: dto.statuses ?? [],
        supplierIds: dto.supplierIds ?? [],
        filters: OperatorScreensService.sanitizeFilters(dto.filters) as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Operator screen template created: ${template.id} ("${template.name}") in org ${organizationId}`,
    );
    return template;
  }

  async listTemplates(organizationId: string, userId: string) {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    return this.prisma.operatorScreenTemplate.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { eventScreens: true } } },
    });
  }

  async getTemplate(
    organizationId: string,
    screenId: string,
    userId: string,
  ): Promise<OperatorScreenTemplate> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);
    return this.requireTemplateInOrg(screenId, organizationId);
  }

  async updateTemplate(
    organizationId: string,
    screenId: string,
    userId: string,
    dto: UpdateOperatorScreenDto,
  ): Promise<OperatorScreenTemplate> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);
    await this.requireTemplateInOrg(screenId, organizationId);

    return this.prisma.operatorScreenTemplate.update({
      where: { id: screenId },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.kind !== undefined && { kind: dto.kind }),
        ...(dto.icon !== undefined && { icon: dto.icon.trim() || null }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.slotKinds !== undefined && { slotKinds: dto.slotKinds }),
        ...(dto.statuses !== undefined && { statuses: dto.statuses }),
        ...(dto.supplierIds !== undefined && { supplierIds: dto.supplierIds }),
        ...(dto.filters !== undefined && {
          filters: OperatorScreensService.sanitizeFilters(dto.filters) as Prisma.InputJsonValue,
        }),
      },
    });
  }

  async deleteTemplate(organizationId: string, screenId: string, userId: string): Promise<void> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);
    await this.requireTemplateInOrg(screenId, organizationId);

    // Cascades remove every event_operator_screens row referencing this template.
    await this.prisma.operatorScreenTemplate.delete({ where: { id: screenId } });
    this.logger.log(`Operator screen template deleted: ${screenId} in org ${organizationId}`);
  }

  // ─── Event application (junction) ─────────────────────────────

  async applyToEvent(eventId: string, userId: string, dto: ApplyEventScreenDto) {
    const { organizationId } = await this.requireEventAccess(eventId, userId, MANAGE_ROLES);
    // The template must belong to the SAME org as the event.
    await this.requireTemplateInOrg(dto.templateId, organizationId);

    try {
      const link = await this.prisma.eventOperatorScreen.create({
        data: {
          eventId,
          templateId: dto.templateId,
          sortOrder: dto.sortOrder ?? null,
          enabled: dto.enabled ?? true,
        },
        include: { template: true },
      });
      this.logger.log(`Event ${eventId}: applied screen template ${dto.templateId}`);
      return link;
    } catch (err: unknown) {
      throw OperatorScreensService.mapKnownError(
        err,
        'This screen template is already applied to the event',
      );
    }
  }

  async listEventScreens(eventId: string, userId: string) {
    await this.requireEventAccess(eventId, userId, ALL_ORG_ROLES);

    return this.prisma.eventOperatorScreen.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      include: { template: true },
    });
  }

  async updateEventScreen(
    eventId: string,
    linkId: string,
    userId: string,
    dto: UpdateEventScreenDto,
  ) {
    await this.requireEventAccess(eventId, userId, MANAGE_ROLES);
    await this.requireLinkInEvent(linkId, eventId);

    return this.prisma.eventOperatorScreen.update({
      where: { id: linkId },
      data: {
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      },
      include: { template: true },
    });
  }

  async removeEventScreen(eventId: string, linkId: string, userId: string): Promise<void> {
    await this.requireEventAccess(eventId, userId, MANAGE_ROLES);
    await this.requireLinkInEvent(linkId, eventId);

    await this.prisma.eventOperatorScreen.delete({ where: { id: linkId } });
    this.logger.log(`Event ${eventId}: removed screen link ${linkId}`);
  }

  // ─── Resolve (operator board consumer) ────────────────────────

  /**
   * Returns the ordered, normalised screens an operator should see for an event.
   *
   * Supplier-pinning mirrors the orders dashboard: if the caller's membership pins
   * a supplierId, that value wins over the query param and screens explicitly
   * scoped to other suppliers are hidden. `screens` is empty when nothing is
   * configured — the board then falls back to its default view.
   */
  async resolveForEvent(
    eventId: string,
    userId: string,
    supplierIdParam?: string,
  ): Promise<{ eventId: string; supplierId: string | null; screens: ResolvedOperatorScreen[] }> {
    const { organizationId } = await this.requireEventAccess(eventId, userId, ALL_ORG_ROLES);

    const membership = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId, organizationId } },
      select: { supplierId: true },
    });
    const effectiveSupplierId = membership?.supplierId ?? supplierIdParam ?? null;

    const links = await this.prisma.eventOperatorScreen.findMany({
      where: { eventId, enabled: true, template: { enabled: true } },
      include: { template: true },
    });

    const screens = links
      .map((link) => OperatorScreensService.normalizeScreen(link))
      .filter(
        (s) =>
          !effectiveSupplierId ||
          s.supplierIds.length === 0 ||
          s.supplierIds.includes(effectiveSupplierId),
      )
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    return { eventId, supplierId: effectiveSupplierId, screens };
  }

  // ─── Private helpers ──────────────────────────────────────────

  private async requireTemplateInOrg(
    screenId: string,
    organizationId: string,
  ): Promise<OperatorScreenTemplate> {
    const template = await this.prisma.operatorScreenTemplate.findFirst({
      where: { id: screenId, organizationId },
    });
    if (!template) {
      throw new NotFoundException('Operator screen template not found in this organization');
    }
    return template;
  }

  private async requireLinkInEvent(linkId: string, eventId: string): Promise<EventOperatorScreen> {
    const link = await this.prisma.eventOperatorScreen.findFirst({
      where: { id: linkId, eventId },
    });
    if (!link) throw new NotFoundException('Screen is not applied to this event');
    return link;
  }

  /** Resolves the event's org and enforces org access; returns { organizationId }. */
  private async requireEventAccess(
    eventId: string,
    userId: string,
    roles = ALL_ORG_ROLES,
  ): Promise<{ organizationId: string }> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { organizationId: true },
    });
    if (!event) throw new NotFoundException('Event not found');
    await requireOrgAccess(this.prisma, userId, event.organizationId, roles);
    return event;
  }

  /** Fills defaults (statuses from kind, effective sortOrder) for a resolved screen. */
  private static normalizeScreen(
    link: EventOperatorScreen & { template: OperatorScreenTemplate },
  ): ResolvedOperatorScreen {
    const t = link.template;
    return {
      eventScreenId: link.id,
      templateId: t.id,
      name: t.name,
      kind: t.kind,
      icon: t.icon,
      sortOrder: link.sortOrder ?? t.sortOrder,
      enabled: link.enabled && t.enabled,
      slotKinds: t.slotKinds,
      statuses: t.statuses.length > 0 ? t.statuses : DEFAULT_STATUSES[t.kind],
      supplierIds: t.supplierIds,
      filters: OperatorScreensService.sanitizeFilters(t.filters),
    };
  }

  /** Whitelists the known filter keys, coercing types — never trusts raw input. */
  static sanitizeFilters(input: unknown): ScreenFilters {
    if (!input || typeof input !== 'object') return {};
    const o = input as Record<string, unknown>;
    const out: ScreenFilters = {};

    const stringArray = (v: unknown): string[] | undefined => {
      if (!Array.isArray(v)) return undefined;
      const arr = v.filter((x): x is string => typeof x === 'string');
      return arr.length > 0 ? Array.from(new Set(arr)) : undefined;
    };

    const categoryIds = stringArray(o.categoryIds);
    if (categoryIds) out.categoryIds = categoryIds;
    const excludeCategoryIds = stringArray(o.excludeCategoryIds);
    if (excludeCategoryIds) out.excludeCategoryIds = excludeCategoryIds;
    const productIds = stringArray(o.productIds);
    if (productIds) out.productIds = productIds;
    const excludeProductIds = stringArray(o.excludeProductIds);
    if (excludeProductIds) out.excludeProductIds = excludeProductIds;
    if (typeof o.showRecap === 'boolean') out.showRecap = o.showRecap;

    return out;
  }

  /** Maps Prisma P2002 (unique) to a 409; rethrows anything else. */
  private static mapKnownError(err: unknown, conflictMessage: string): unknown {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return new ConflictException(conflictMessage);
    }
    return err;
  }
}
