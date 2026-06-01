import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import {
  requireOrgAccess,
  MANAGE_ROLES,
  ALL_ORG_ROLES,
} from '../../common/helpers/require-org-access';
import type { CreateCategoryDto } from './dto/create-category.dto';
import type { UpdateCategoryDto } from './dto/update-category.dto';
import type { Category } from '@prisma/client';

/**
 * CategoriesService owns menu-category persistence logic.
 *
 * Access rules:
 * - Read: any org member
 * - Create / Update / Delete: ORG_ADMIN or MANAGER
 *
 * Rules:
 * - Category must belong to a supplier in the caller's org.
 * - Deleting a category with products is blocked (RESTRICT FK).
 */
@Injectable()
export class CategoriesService {
  private readonly logger = new Logger(CategoriesService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(
    organizationId: string,
    supplierId: string,
    userId: string,
    dto: CreateCategoryDto,
  ): Promise<Category> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);
    await this.requireSupplierInOrg(supplierId, organizationId);

    const category = await this.prisma.category.create({
      data: {
        supplierId,
        name: dto.name,
        sortOrder: dto.sortOrder ?? 0,
        status: dto.status,
      },
    });

    this.logger.log(`Category created: ${category.id} ("${category.name}") for supplier ${supplierId}`);
    return category;
  }

  async findAllBySupplier(
    organizationId: string,
    supplierId: string,
    userId: string,
  ): Promise<Category[]> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);
    await this.requireSupplierInOrg(supplierId, organizationId);

    return this.prisma.category.findMany({
      where: { supplierId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(
    organizationId: string,
    supplierId: string,
    categoryId: string,
    userId: string,
  ): Promise<Category> {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, supplierId },
    });

    if (!category) throw new NotFoundException('Category not found');

    // Verify the supplier belongs to this org
    await this.requireSupplierInOrg(supplierId, organizationId);
    return category;
  }

  async update(
    organizationId: string,
    supplierId: string,
    categoryId: string,
    userId: string,
    dto: UpdateCategoryDto,
  ): Promise<Category> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);
    await this.requireSupplierInOrg(supplierId, organizationId);

    const existing = await this.prisma.category.findFirst({
      where: { id: categoryId, supplierId },
    });
    if (!existing) throw new NotFoundException('Category not found');

    const updated = await this.prisma.category.update({
      where: { id: categoryId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.status !== undefined && { status: dto.status }),
      },
    });

    this.logger.log(`Category updated: ${categoryId} for supplier ${supplierId}`);
    return updated;
  }

  async remove(
    organizationId: string,
    supplierId: string,
    categoryId: string,
    userId: string,
  ): Promise<void> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);
    await this.requireSupplierInOrg(supplierId, organizationId);

    const existing = await this.prisma.category.findFirst({
      where: { id: categoryId, supplierId },
    });
    if (!existing) throw new NotFoundException('Category not found');

    try {
      await this.prisma.category.delete({ where: { id: categoryId } });
    } catch (err: unknown) {
      // Prisma error P2003 = foreign key constraint — products still reference this category
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2003'
      ) {
        throw new ConflictException(
          'Cannot delete category: it still has products. Archive or move products first.',
        );
      }
      throw err;
    }

    this.logger.log(`Category deleted: ${categoryId} for supplier ${supplierId}`);
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
}
