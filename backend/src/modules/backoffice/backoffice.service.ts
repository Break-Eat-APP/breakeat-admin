import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, OrgStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { CreateBackofficeOrgDto } from './dto/create-backoffice-org.dto';
import type { UpdateBackofficeOrgDto } from './dto/update-backoffice-org.dto';

/**
 * Cross-tenant KPI snapshot for the back-office overview.
 * All monetary values are integer cents. caHt is derived from caTtc using the
 * configured reporting VAT rate (orders store TTC totals only).
 */
export interface GlobalKpis {
  revenue: {
    caTtcCents: number;
    caHtCents: number;
    /** VAT rate used to derive HT from TTC (e.g. 0.1 for 10%). */
    vatRate: number;
  };
  ordersCount: number;
  averageBasket: {
    htCents: number;
    ttcCents: number;
  };
  /** Total customer + admin accounts on the platform. */
  accountsCount: number;
  organizationsCount: number;
}

/**
 * BackofficeService — cross-tenant supervision logic for SUPER_ADMIN only.
 *
 * Unlike OrganizationsService (org-scoped, membership-gated), every method here
 * is platform-wide. Access control is enforced upstream by RolesGuard +
 * @Roles(SUPER_ADMIN) on the controller, so the service assumes the caller is
 * already authorised and does not re-check membership.
 *
 * Revenue rule: an order counts toward CA only when paymentStatus = SUCCEEDED.
 * Order.totalCents is tax-inclusive (TTC); CA HT = round(TTC / (1 + vatRate)).
 */
@Injectable()
export class BackofficeService {
  private readonly logger = new Logger(BackofficeService.name);
  private readonly vatRate: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    const configured = this.config.get<number>('app.reporting.vatRate');
    // Guard against a missing / NaN env override; fall back to 10%.
    this.vatRate =
      typeof configured === 'number' && Number.isFinite(configured) && configured >= 0
        ? configured
        : 0.1;
  }

  // ─── KPIs ─────────────────────────────────────────────────────

  /**
   * Aggregates platform-wide KPIs over PAID orders (paymentStatus = SUCCEEDED).
   * Returns CA HT/TTC, order count, average basket HT/TTC, account & org counts.
   */
  async getGlobalKpis(): Promise<GlobalKpis> {
    const [agg, accountsCount, organizationsCount] = await Promise.all([
      this.prisma.order.aggregate({
        where: { paymentStatus: PaymentStatus.SUCCEEDED },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
      this.prisma.user.count(),
      this.prisma.organization.count(),
    ]);

    const caTtcCents = agg._sum.totalCents ?? 0;
    const ordersCount = agg._count._all;
    const caHtCents = this.toHtCents(caTtcCents);

    const avgBasketTtcCents = ordersCount > 0 ? Math.round(caTtcCents / ordersCount) : 0;
    const avgBasketHtCents = ordersCount > 0 ? Math.round(caHtCents / ordersCount) : 0;

    return {
      revenue: { caTtcCents, caHtCents, vatRate: this.vatRate },
      ordersCount,
      averageBasket: { htCents: avgBasketHtCents, ttcCents: avgBasketTtcCents },
      accountsCount,
      organizationsCount,
    };
  }

  // ─── Organisations (cross-tenant CRUD) ────────────────────────

  /** Lists every organisation with member / event / supplier / group counts. */
  async listOrganizations() {
    return this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        logoUrl: true,
        primaryColor: true,
        createdAt: true,
        _count: {
          select: { members: true, events: true, suppliers: true, groups: true },
        },
      },
    });
  }

  /** Returns a single organisation with members + counts. 404 if unknown. */
  async getOrganization(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true, displayName: true, globalRole: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { members: true, events: true, suppliers: true, groups: true },
        },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  /**
   * Provisions a new organisation shell (no membership). The SUPER_ADMIN
   * invites the real ORG_ADMIN afterwards. Slug must be globally unique.
   */
  async createOrganization(dto: CreateBackofficeOrgDto) {
    const existing = await this.prisma.organization.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) throw new ConflictException(`Slug "${dto.slug}" is already taken`);

    const org = await this.prisma.organization.create({
      data: { name: dto.name, slug: dto.slug },
    });

    this.logger.log(`[backoffice] Organization created: ${org.id} (${org.slug})`);
    return org;
  }

  /**
   * Updates an organisation's profile and/or branding.
   * Only provided fields are written. A new slug must stay globally unique.
   */
  async updateOrganization(id: string, dto: UpdateBackofficeOrgDto) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');

    if (dto.slug && dto.slug !== org.slug) {
      const clash = await this.prisma.organization.findUnique({
        where: { slug: dto.slug },
      });
      if (clash) throw new ConflictException(`Slug "${dto.slug}" is already taken`);
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });

    this.logger.log(`[backoffice] Organization updated: ${id}`);
    return updated;
  }

  /**
   * Activates (ACTIVE) or deactivates (SUSPENDED) an organisation.
   * Deactivation is a soft lock — data is preserved, but the org is suspended.
   */
  async setOrganizationStatus(id: string, active: boolean) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');

    const status = active ? OrgStatus.ACTIVE : OrgStatus.SUSPENDED;
    const updated = await this.prisma.organization.update({
      where: { id },
      data: { status },
    });

    this.logger.log(`[backoffice] Organization ${id} status → ${status}`);
    return updated;
  }

  // ─── Groups (cross-tenant read) ───────────────────────────────

  /**
   * Lists every group across all organisations, with their owning org and
   * member / event counts. Read-only supervision view for the back office.
   */
  async listGroups() {
    return this.prisma.group.findMany({
      orderBy: [{ organization: { name: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        emailDomain: true,
        createdAt: true,
        organization: { select: { id: true, name: true, slug: true } },
        _count: { select: { members: true, events: true } },
      },
    });
  }

  // ─── Private helpers ──────────────────────────────────────────

  /** TTC cents → HT cents using the configured reporting VAT rate. */
  private toHtCents(ttcCents: number): number {
    return Math.round(ttcCents / (1 + this.vatRate));
  }
}
