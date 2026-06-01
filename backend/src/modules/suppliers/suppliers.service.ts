import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { OrgRole } from '../../common/enums/role.enum';
import {
  requireOrgAccess,
  MANAGE_ROLES,
  ALL_ORG_ROLES,
} from '../../common/helpers/require-org-access';
import { StripeService } from '../payments/stripe.service';
import type { CreateSupplierDto } from './dto/create-supplier.dto';
import type { UpdateSupplierDto } from './dto/update-supplier.dto';
import type { UpdateSupplierStatusDto } from './dto/update-supplier-status.dto';
import type { CreateOnboardingLinkDto } from './dto/create-onboarding-link.dto';
import { StripeAccountStatus, type Supplier } from '@prisma/client';

/**
 * SuppliersService owns all supplier persistence logic.
 *
 * Access rules:
 * - Read: any org member
 * - Create / Update metadata: ORG_ADMIN or MANAGER
 * - Change status (OPEN/CLOSED/PAUSED): ORG_ADMIN, MANAGER or OPERATOR
 *
 * Note: stripeAccountId is managed by Phase 5 (Stripe Connect onboarding).
 * It is never set via this service.
 */
@Injectable()
export class SuppliersService {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  async create(
    organizationId: string,
    userId: string,
    dto: CreateSupplierDto,
  ): Promise<Supplier> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const supplier = await this.prisma.supplier.create({
      data: {
        organizationId,
        name: dto.name,
        preparationZone: dto.preparationZone,
      },
    });

    this.logger.log(`Supplier created: ${supplier.id} ("${supplier.name}") in org ${organizationId}`);
    return supplier;
  }

  async findAllByOrg(organizationId: string, userId: string): Promise<Supplier[]> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    return this.prisma.supplier.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(organizationId: string, supplierId: string, userId: string): Promise<Supplier> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });

    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  async update(
    organizationId: string,
    supplierId: string,
    userId: string,
    dto: UpdateSupplierDto,
  ): Promise<Supplier> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const existing = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!existing) throw new NotFoundException('Supplier not found');

    const updated = await this.prisma.supplier.update({
      where: { id: supplierId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.preparationZone !== undefined && { preparationZone: dto.preparationZone }),
      },
    });

    this.logger.log(`Supplier updated: ${supplierId} in org ${organizationId}`);
    return updated;
  }

  /**
   * Updates only the operational status.
   * OPERATOR is allowed to change status (e.g. mark as OPEN when ready).
   */
  async updateStatus(
    organizationId: string,
    supplierId: string,
    userId: string,
    dto: UpdateSupplierStatusDto,
  ): Promise<Supplier> {
    // ORG_ADMIN, MANAGER and OPERATOR can change supplier status
    await requireOrgAccess(this.prisma, userId, organizationId, [
      ...MANAGE_ROLES,
      OrgRole.OPERATOR,
    ]);

    const existing = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!existing) throw new NotFoundException('Supplier not found');

    const updated = await this.prisma.supplier.update({
      where: { id: supplierId },
      data: { status: dto.status },
    });

    this.logger.log(
      `Supplier status changed: ${supplierId} → ${dto.status} (by user ${userId})`,
    );
    return updated;
  }

  // ─── Stripe Connect ──────────────────────────────────────────

  /**
   * Creates (or reuses) a Stripe Connect Standard account for the supplier
   * and returns a fresh onboarding URL.
   *
   * Stripe account links are single-use and short-lived — generate a new one
   * on every onboarding entry point.
   *
   * Only ORG_ADMIN / MANAGER can initiate or refresh onboarding.
   */
  async createOnboardingLink(
    organizationId: string,
    supplierId: string,
    userId: string,
    dto: CreateOnboardingLinkDto,
  ): Promise<{ accountId: string; url: string; expiresAt: number }> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    let accountId = supplier.stripeAccountId;

    if (!accountId) {
      // No account yet — create one. Use the caller's email by default.
      const callerEmail = dto.email ?? (await this.getCallerEmail(userId));

      const account = await this.stripe.createConnectAccount({
        email: callerEmail,
        country: dto.country ?? 'FR',
        businessName: dto.businessName ?? supplier.name,
        metadata: {
          supplierId,
          organizationId,
        },
      });

      accountId = account.id;

      await this.prisma.supplier.update({
        where: { id: supplierId },
        data: {
          stripeAccountId: accountId,
          stripeAccountStatus: StripeAccountStatus.PENDING,
        },
      });

      this.logger.log(
        `Stripe Connect account created for supplier ${supplierId}: ${accountId}`,
      );
    }

    const link = await this.stripe.createOnboardingLink(accountId);

    return {
      accountId,
      url: link.url,
      expiresAt: link.expires_at,
    };
  }

  /**
   * Reads the live Stripe account state, mirrors it on Supplier, and returns the result.
   * Called explicitly by the supplier or via webhook on `account.updated`.
   */
  async refreshStripeStatus(
    organizationId: string,
    supplierId: string,
    userId: string,
  ): Promise<Supplier> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    if (!supplier.stripeAccountId) {
      throw new BadRequestException(
        'Supplier has no Stripe account yet — call onboarding-link first',
      );
    }

    const account = await this.stripe.retrieveAccount(supplier.stripeAccountId);
    const newStatus = this.deriveAccountStatus(account);

    const updated = await this.prisma.supplier.update({
      where: { id: supplierId },
      data: {
        stripeAccountStatus: newStatus,
        stripeChargesEnabled: account.charges_enabled,
        stripePayoutsEnabled: account.payouts_enabled,
        // Stamp first time we reach ACTIVE
        ...(newStatus === StripeAccountStatus.ACTIVE &&
          !supplier.stripeOnboardedAt && { stripeOnboardedAt: new Date() }),
      },
    });

    this.logger.log(
      `Stripe status refreshed for supplier ${supplierId}: ${newStatus} (charges=${account.charges_enabled}, payouts=${account.payouts_enabled})`,
    );
    return updated;
  }

  // ─── Private helpers ─────────────────────────────────────────

  private async getCallerEmail(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) {
      throw new NotFoundException('Caller user not found');
    }
    return user.email;
  }

  /**
   * Maps a Stripe Account object to our internal StripeAccountStatus enum.
   *
   * Rules:
   * - charges_enabled && payouts_enabled → ACTIVE
   * - details_submitted but missing capabilities → RESTRICTED
   * - account exists but onboarding incomplete → PENDING
   */
  private deriveAccountStatus(account: {
    charges_enabled?: boolean;
    payouts_enabled?: boolean;
    details_submitted?: boolean;
  }): StripeAccountStatus {
    const chargesOk = account.charges_enabled === true;
    const payoutsOk = account.payouts_enabled === true;

    if (chargesOk && payoutsOk) return StripeAccountStatus.ACTIVE;
    if (account.details_submitted) return StripeAccountStatus.RESTRICTED;
    return StripeAccountStatus.PENDING;
  }
}
