import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';

import { ProductStatus } from '@prisma/client';
import { ProductsService } from './products.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const SUPPLIER_ID = 'supplier-1';
const OTHER_SUPPLIER_ID = 'supplier-2';
const CATEGORY_ID = 'category-1';
const PRODUCT_ID = 'product-1';

function mockMember() {
  return { userId: USER_ID, organizationId: ORG_ID, orgRole: 'ORG_ADMIN' };
}

function mockSupplier() {
  return { id: SUPPLIER_ID, organizationId: ORG_ID };
}

function mockCategory(supplierId = SUPPLIER_ID) {
  return { id: CATEGORY_ID, supplierId };
}

function mockProduct() {
  return {
    id: PRODUCT_ID,
    supplierId: SUPPLIER_ID,
    categoryId: CATEGORY_ID,
    name: 'Burger',
    description: null,
    price: 800,
    imageUrl: null,
    status: ProductStatus.ACTIVE,
    availableFrom: null,
    availableUntil: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn() },
            organizationMember: { findUnique: jest.fn() },
            supplier: { findFirst: jest.fn() },
            category: { findUnique: jest.fn() },
            product: {
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

    service = module.get<ProductsService>(ProductsService);
    prisma = module.get(PrismaService);
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('creates a product when supplier, category, and org are valid', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(mockSupplier());
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(mockCategory());
      (prisma.product.create as jest.Mock).mockResolvedValue(mockProduct());

      const result = await service.create(ORG_ID, SUPPLIER_ID, USER_ID, {
        categoryId: CATEGORY_ID,
        name: 'Burger',
        price: 800,
      });

      expect(result.name).toBe('Burger');
      expect(result.price).toBe(800);
    });

    it('throws ForbiddenException when caller is not an org member', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, SUPPLIER_ID, USER_ID, {
          categoryId: CATEGORY_ID,
          name: 'Burger',
          price: 800,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when supplier is not in the org', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, 'wrong-supplier', USER_ID, {
          categoryId: CATEGORY_ID,
          name: 'Burger',
          price: 800,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when category does not exist', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(mockSupplier());
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, SUPPLIER_ID, USER_ID, {
          categoryId: 'wrong-cat',
          name: 'Burger',
          price: 800,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when category belongs to a different supplier', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(mockSupplier());
      // Category belongs to OTHER_SUPPLIER_ID, not SUPPLIER_ID
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(mockCategory(OTHER_SUPPLIER_ID));

      await expect(
        service.create(ORG_ID, SUPPLIER_ID, USER_ID, {
          categoryId: CATEGORY_ID,
          name: 'Burger',
          price: 800,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when availableUntil is not after availableFrom', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(mockSupplier());
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(mockCategory());

      await expect(
        service.create(ORG_ID, SUPPLIER_ID, USER_ID, {
          categoryId: CATEGORY_ID,
          name: 'Breakfast Burger',
          price: 800,
          availableFrom: '2026-06-01T12:00:00Z',
          availableUntil: '2026-06-01T11:00:00Z', // BEFORE availableFrom
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── update ──────────────────────────────────────────────────

  describe('update', () => {
    it('updates a product successfully', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(mockSupplier());
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(mockProduct());
      const updated = { ...mockProduct(), name: 'Veggie Burger', price: 950 };
      (prisma.product.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.update(ORG_ID, SUPPLIER_ID, PRODUCT_ID, USER_ID, {
        name: 'Veggie Burger',
        price: 950,
      });

      expect(result.name).toBe('Veggie Burger');
      expect(result.price).toBe(950);
    });

    it('throws BadRequestException when moving to a category from a different supplier', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(mockSupplier());
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(mockProduct());
      // New category belongs to OTHER_SUPPLIER_ID
      (prisma.category.findUnique as jest.Mock).mockResolvedValue(mockCategory(OTHER_SUPPLIER_ID));

      await expect(
        service.update(ORG_ID, SUPPLIER_ID, PRODUCT_ID, USER_ID, {
          categoryId: 'other-category',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when product does not exist', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.supplier.findFirst as jest.Mock).mockResolvedValue(mockSupplier());
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update(ORG_ID, SUPPLIER_ID, 'bad-id', USER_ID, { name: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
