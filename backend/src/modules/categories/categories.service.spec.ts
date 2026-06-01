import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CategoryStatus } from '@prisma/client';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const SUPPLIER_ID = 'supplier-1';
const CATEGORY_ID = 'category-1';

function mockMember() {
  return { userId: USER_ID, organizationId: ORG_ID, orgRole: 'ORG_ADMIN' };
}

function mockSupplier() {
  return { id: SUPPLIER_ID, organizationId: ORG_ID };
}

function mockCategory() {
  return {
    id: CATEGORY_ID,
    supplierId: SUPPLIER_ID,
    name: 'Burgers',
    sortOrder: 0,
    status: CategoryStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CategoriesService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn() },
            organizationMember: { findUnique: jest.fn() },
            supplier: { findFirst: jest.fn() },
            category: {
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<CategoriesService>(CategoriesService);
    prisma = module.get(PrismaService);
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('creates a category when supplier and org are valid', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(mockSupplier());
      (prisma.category.create as jest.Mock).mockResolvedValue(mockCategory());

      const result = await service.create(ORG_ID, SUPPLIER_ID, USER_ID, { name: 'Burgers' });

      expect(result.name).toBe('Burgers');
      expect(result.supplierId).toBe(SUPPLIER_ID);
    });

    it('throws ForbiddenException when caller is not an org member', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, SUPPLIER_ID, USER_ID, { name: 'Burgers' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when supplier is not in the org', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, 'wrong-supplier', USER_ID, { name: 'Burgers' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findAllBySupplier ───────────────────────────────────────

  describe('findAllBySupplier', () => {
    it('returns categories ordered by sortOrder', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(mockSupplier());
      const categories = [mockCategory(), { ...mockCategory(), id: 'cat-2', name: 'Desserts', sortOrder: 1 }];
      (prisma.category.findMany as jest.Mock).mockResolvedValue(categories);

      const result = await service.findAllBySupplier(ORG_ID, SUPPLIER_ID, USER_ID);

      expect(result).toHaveLength(2);
      expect(prisma.category.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { supplierId: SUPPLIER_ID } }),
      );
    });
  });

  // ─── update ──────────────────────────────────────────────────

  describe('update', () => {
    it('updates a category name and sortOrder', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(mockSupplier());
      (prisma.category.findFirst as jest.Mock).mockResolvedValue(mockCategory());
      const updated = { ...mockCategory(), name: 'Salads', sortOrder: 2 };
      (prisma.category.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.update(ORG_ID, SUPPLIER_ID, CATEGORY_ID, USER_ID, {
        name: 'Salads',
        sortOrder: 2,
      });

      expect(result.name).toBe('Salads');
      expect(result.sortOrder).toBe(2);
    });

    it('throws NotFoundException when category does not exist', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(mockSupplier());
      (prisma.category.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update(ORG_ID, SUPPLIER_ID, 'bad-id', USER_ID, { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── remove ──────────────────────────────────────────────────

  describe('remove', () => {
    it('deletes an empty category successfully', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(mockSupplier());
      (prisma.category.findFirst as jest.Mock).mockResolvedValue(mockCategory());
      (prisma.category.delete as jest.Mock).mockResolvedValue(mockCategory());

      await expect(
        service.remove(ORG_ID, SUPPLIER_ID, CATEGORY_ID, USER_ID),
      ).resolves.toBeUndefined();
    });

    it('throws NotFoundException when category does not exist', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(mockSupplier());
      (prisma.category.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.remove(ORG_ID, SUPPLIER_ID, 'bad-id', USER_ID),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when category still has products (Prisma P2003)', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(mockSupplier());
      (prisma.category.findFirst as jest.Mock).mockResolvedValue(mockCategory());
      // Simulate Prisma FK violation
      (prisma.category.delete as jest.Mock).mockRejectedValue({ code: 'P2003' });

      await expect(
        service.remove(ORG_ID, SUPPLIER_ID, CATEGORY_ID, USER_ID),
      ).rejects.toThrow(ConflictException);
    });
  });
});
