import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  requireOrgAccess,
  MANAGE_ROLES,
  ALL_ORG_ROLES,
} from '../../common/helpers/require-org-access';
import type { CreateProductDto } from './dto/create-product.dto';
import type { UpdateProductDto } from './dto/update-product.dto';
import type { Product } from '@prisma/client';

/**
 * ProductsService owns product catalog persistence logic.
 *
 * Access rules:
 * - Read: any org member
 * - Create / Update / Delete: ORG_ADMIN or MANAGER
 *
 * Rules:
 * - Product must belong to a supplier in the caller's org.
 * - categoryId must refer to a category owned by the SAME supplier.
 * - price is in cents (Int, >= 0) — validated by DTO and CHECK constraint.
 * - availableFrom/availableUntil are optional time-window gates.
 */
@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    supplierId: string,
    userId: string,
    dto: CreateProductDto,
  ): Promise<Product> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);
    await this.requireSupplierInOrg(supplierId, organizationId);
    await this.requireCategoryForSupplier(dto.categoryId, supplierId);

    this.validateDateWindow(dto.availableFrom, dto.availableUntil);

    const product = await this.prisma.product.create({
      data: {
        supplierId,
        categoryId: dto.categoryId,
        name: dto.name,
        description: dto.description ?? null,
        price: dto.price,
        imageUrl: dto.imageUrl ?? null,
        status: dto.status,
        availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : null,
        availableUntil: dto.availableUntil ? new Date(dto.availableUntil) : null,
      },
    });

    this.logger.log(`Product created: ${product.id} ("${product.name}") price=${product.price}¢ supplier=${supplierId}`);
    return product;
  }

  async findAllBySupplier(
    organizationId: string,
    supplierId: string,
    userId: string,
  ): Promise<Product[]> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);
    await this.requireSupplierInOrg(supplierId, organizationId);

    return this.prisma.product.findMany({
      where: { supplierId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(
    organizationId: string,
    supplierId: string,
    productId: string,
    userId: string,
  ): Promise<Product> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);
    await this.requireSupplierInOrg(supplierId, organizationId);

    const product = await this.prisma.product.findFirst({
      where: { id: productId, supplierId },
    });

    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  async update(
    organizationId: string,
    supplierId: string,
    productId: string,
    userId: string,
    dto: UpdateProductDto,
  ): Promise<Product> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);
    await this.requireSupplierInOrg(supplierId, organizationId);

    const existing = await this.prisma.product.findFirst({
      where: { id: productId, supplierId },
    });
    if (!existing) throw new NotFoundException('Product not found');

    // If moving to a different category, verify it belongs to the same supplier
    if (dto.categoryId && dto.categoryId !== existing.categoryId) {
      await this.requireCategoryForSupplier(dto.categoryId, supplierId);
    }

    // Resolve effective window (merge dto values with existing ones) before validating
    const effectiveFrom = dto.availableFrom ?? (existing.availableFrom?.toISOString() ?? undefined);
    const effectiveUntil = dto.availableUntil ?? (existing.availableUntil?.toISOString() ?? undefined);
    this.validateDateWindow(effectiveFrom, effectiveUntil);

    const updated = await this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.categoryId !== undefined && { categoryId: dto.categoryId }),
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.price !== undefined && { price: dto.price }),
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.availableFrom !== undefined && { availableFrom: new Date(dto.availableFrom) }),
        ...(dto.availableUntil !== undefined && { availableUntil: new Date(dto.availableUntil) }),
      },
    });

    this.logger.log(`Product updated: ${productId} supplier=${supplierId}`);
    return updated;
  }

  async remove(
    organizationId: string,
    supplierId: string,
    productId: string,
    userId: string,
  ): Promise<void> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);
    await this.requireSupplierInOrg(supplierId, organizationId);

    const existing = await this.prisma.product.findFirst({
      where: { id: productId, supplierId },
    });
    if (!existing) throw new NotFoundException('Product not found');

    await this.prisma.product.delete({ where: { id: productId } });
    this.logger.log(`Product deleted: ${productId} supplier=${supplierId}`);
  }

  // ─── Private helpers ──────────────────────────────────────────

  private async requireSupplierInOrg(
    supplierId: string,
    organizationId: string,
  ): Promise<void> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, organizationId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found in this organization');
  }

  /**
   * Validates that availableUntil is strictly after availableFrom when both are provided.
   */
  private validateDateWindow(from?: string, until?: string): void {
    if (from && until && new Date(until) <= new Date(from)) {
      throw new BadRequestException('availableUntil must be after availableFrom');
    }
  }

  /**
   * Verifies that categoryId belongs to the given supplier.
   * Throws BadRequestException if the category belongs to a different supplier.
   */
  private async requireCategoryForSupplier(
    categoryId: string,
    supplierId: string,
  ): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
    });

    if (!category) {
      throw new NotFoundException('Category not found');
    }

    if (category.supplierId !== supplierId) {
      throw new BadRequestException('Category does not belong to this supplier');
    }
  }
}
