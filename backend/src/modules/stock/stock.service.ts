import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { OrgRole } from '../../common/enums/role.enum';
import { PrismaService } from '../../database/prisma.service';
import {
  requireOrgAccess,
  MANAGE_ROLES,
  ALL_ORG_ROLES,
} from '../../common/helpers/require-org-access';
import type { CreateStockDto } from './dto/create-stock.dto';
import type { UpdateStockDto } from './dto/update-stock.dto';
import type { UpdateStockAvailabilityDto } from './dto/update-stock-availability.dto';
import type { Stock } from '@prisma/client';

/**
 * StockService owns inventory management for products.
 *
 * Key rules:
 * - Stock is scoped per product, optionally per pickup point.
 * - Only one global stock entry (pickupPointId = null) per product (service-level uniqueness).
 * - Only one stock entry per (product, pickupPoint) pair (DB partial unique index).
 * - When quantity reaches 0, isAvailable is automatically set to false.
 * - OPERATOR, MANAGER, and ORG_ADMIN can toggle isAvailable (not quantity).
 * - Only MANAGER and ORG_ADMIN can update quantity or create/delete stock entries.
 * - Stock decrement on order placement is handled in Phase 6 (Orders).
 */
@Injectable()
export class StockService {
  private readonly logger = new Logger(StockService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    userId: string,
    dto: CreateStockDto,
  ): Promise<Stock> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    // Verify product's supplier belongs to this org
    await this.requireProductInOrg(dto.productId, dto.supplierId, organizationId);

    // Verify pickup point belongs to this org AND to the same supplier (if scoped)
    if (dto.pickupPointId) {
      await this.requirePickupPointInOrg(dto.pickupPointId, organizationId, dto.supplierId);
    }

    // Enforce one global stock entry per product
    if (!dto.pickupPointId) {
      const globalExists = await this.prisma.stock.findFirst({
        where: { productId: dto.productId, pickupPointId: null },
      });
      if (globalExists) {
        throw new ConflictException(
          'A global stock entry already exists for this product. Use PATCH to update it.',
        );
      }
    }

    const initialQuantity = dto.quantity ?? 0;
    const stock = await this.prisma.stock.create({
      data: {
        productId: dto.productId,
        supplierId: dto.supplierId,
        pickupPointId: dto.pickupPointId ?? null,
        quantity: initialQuantity,
        // auto-unavailable when starting at 0
        isAvailable: initialQuantity > 0 ? (dto.isAvailable ?? true) : false,
      },
    });

    this.logger.log(
      `Stock created: ${stock.id} product=${dto.productId} qty=${stock.quantity} pp=${dto.pickupPointId ?? 'global'}`,
    );
    return stock;
  }

  async findAllByOrg(
    organizationId: string,
    userId: string,
    filters?: { productId?: string; supplierId?: string; pickupPointId?: string },
  ): Promise<Stock[]> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    return this.prisma.stock.findMany({
      where: {
        supplier: { organizationId },
        ...(filters?.productId && { productId: filters.productId }),
        ...(filters?.supplierId && { supplierId: filters.supplierId }),
        ...(filters?.pickupPointId && { pickupPointId: filters.pickupPointId }),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(
    organizationId: string,
    stockId: string,
    userId: string,
  ): Promise<Stock> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    const stock = await this.prisma.stock.findFirst({
      where: { id: stockId, supplier: { organizationId } },
    });

    if (!stock) throw new NotFoundException('Stock entry not found');
    return stock;
  }

  /**
   * Updates quantity and/or isAvailable.
   * Only MANAGER / ORG_ADMIN can call this (not OPERATOR — use updateAvailability instead).
   * Auto-sets isAvailable = false if quantity drops to 0.
   */
  async update(
    organizationId: string,
    stockId: string,
    userId: string,
    dto: UpdateStockDto,
  ): Promise<Stock> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const existing = await this.prisma.stock.findFirst({
      where: { id: stockId, supplier: { organizationId } },
    });
    if (!existing) throw new NotFoundException('Stock entry not found');

    const newQuantity = dto.quantity !== undefined ? dto.quantity : existing.quantity;
    // Force isAvailable = false if quantity is 0, regardless of dto value
    const newIsAvailable = newQuantity === 0 ? false : (dto.isAvailable ?? existing.isAvailable);

    const updated = await this.prisma.stock.update({
      where: { id: stockId },
      data: {
        ...(dto.quantity !== undefined && { quantity: newQuantity }),
        isAvailable: newIsAvailable,
      },
    });

    this.logger.log(`Stock updated: ${stockId} qty=${updated.quantity} available=${updated.isAvailable}`);
    return updated;
  }

  /**
   * Toggles isAvailable only — allowed for OPERATOR, MANAGER, ORG_ADMIN.
   * Used to 86 an item mid-service or bring it back.
   * Does NOT allow isAvailable = true when quantity = 0.
   */
  async updateAvailability(
    organizationId: string,
    stockId: string,
    userId: string,
    dto: UpdateStockAvailabilityDto,
  ): Promise<Stock> {
    await requireOrgAccess(this.prisma, userId, organizationId, [
      ...MANAGE_ROLES,
      OrgRole.OPERATOR,
    ]);

    const existing = await this.prisma.stock.findFirst({
      where: { id: stockId, supplier: { organizationId } },
    });
    if (!existing) throw new NotFoundException('Stock entry not found');

    // Cannot mark available if quantity is 0
    const safeIsAvailable = existing.quantity === 0 ? false : dto.isAvailable;

    const updated = await this.prisma.stock.update({
      where: { id: stockId },
      data: { isAvailable: safeIsAvailable },
    });

    this.logger.log(`Stock availability: ${stockId} → ${updated.isAvailable} (by user ${userId})`);
    return updated;
  }

  // ─── Private helpers ──────────────────────────────────────────

  /**
   * Verifies the product exists and its supplier belongs to this org.
   */
  private async requireProductInOrg(
    productId: string,
    supplierId: string,
    organizationId: string,
  ): Promise<void> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, supplierId },
      include: { supplier: { select: { organizationId: true } } },
    });

    if (!product) {
      throw new NotFoundException('Product not found for this supplier');
    }

    if (product.supplier.organizationId !== organizationId) {
      throw new NotFoundException('Supplier not found in this organization');
    }
  }

  /**
   * Verifies the pickup point belongs to this org.
   * If the pickup point is supplier-scoped (supplierId not null), it must match
   * the stock's supplier — prevents cross-supplier stock contamination.
   */
  private async requirePickupPointInOrg(
    pickupPointId: string,
    organizationId: string,
    stockSupplierId: string,
  ): Promise<void> {
    const pp = await this.prisma.pickupPoint.findFirst({
      where: { id: pickupPointId, organizationId },
    });
    if (!pp) throw new NotFoundException('Pickup point not found in this organization');

    if (pp.supplierId !== null && pp.supplierId !== stockSupplierId) {
      throw new BadRequestException(
        'Pickup point is scoped to a different supplier — cannot create stock for this supplier here',
      );
    }
  }
}
