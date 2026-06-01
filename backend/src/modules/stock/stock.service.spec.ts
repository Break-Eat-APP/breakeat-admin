import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { StockService } from './stock.service';
import { PrismaService } from '../../database/prisma.service';

// ─── Helpers ─────────────────────────────────────────────────

const ORG_ID = 'org-1';
const USER_ID = 'user-1';
const PRODUCT_ID = 'product-1';
const SUPPLIER_ID = 'supplier-1';
const OTHER_SUPPLIER_ID = 'supplier-2';
const PICKUP_POINT_ID = 'pp-1';
const STOCK_ID = 'stock-1';

function mockMember() {
  return { userId: USER_ID, organizationId: ORG_ID, orgRole: 'ORG_ADMIN' };
}

function mockProduct() {
  return {
    id: PRODUCT_ID,
    supplierId: SUPPLIER_ID,
    supplier: { organizationId: ORG_ID },
  };
}

function mockStock(overrides: Partial<{ quantity: number; isAvailable: boolean; pickupPointId: string | null }> = {}) {
  return {
    id: STOCK_ID,
    productId: PRODUCT_ID,
    supplierId: SUPPLIER_ID,
    pickupPointId: null,
    quantity: 10,
    isAvailable: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────

describe('StockService', () => {
  let service: StockService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        {
          provide: PrismaService,
          useValue: {
            user: { findUnique: jest.fn() },
            organizationMember: { findUnique: jest.fn() },
            product: { findFirst: jest.fn() },
            supplier: { findFirst: jest.fn() },
            pickupPoint: { findFirst: jest.fn() },
            stock: {
              create: jest.fn(),
              findMany: jest.fn(),
              findFirst: jest.fn(),
              update: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<StockService>(StockService);
    prisma = module.get(PrismaService);
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('creates a global stock entry (no pickup point)', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(mockProduct());
      (prisma.stock.findFirst as jest.Mock).mockResolvedValue(null); // no existing global stock
      const created = mockStock({ quantity: 50 });
      (prisma.stock.create as jest.Mock).mockResolvedValue(created);

      const result = await service.create(ORG_ID, USER_ID, {
        productId: PRODUCT_ID,
        supplierId: SUPPLIER_ID,
        quantity: 50,
      });

      expect(result.quantity).toBe(50);
      expect(result.isAvailable).toBe(true);
    });

    it('sets isAvailable = false when initial quantity is 0', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(mockProduct());
      (prisma.stock.findFirst as jest.Mock).mockResolvedValue(null);
      const created = mockStock({ quantity: 0, isAvailable: false });
      (prisma.stock.create as jest.Mock).mockResolvedValue(created);

      const result = await service.create(ORG_ID, USER_ID, {
        productId: PRODUCT_ID,
        supplierId: SUPPLIER_ID,
        quantity: 0,
      });

      expect(result.isAvailable).toBe(false);
      const createCall = (prisma.stock.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.isAvailable).toBe(false);
    });

    it('throws ConflictException when global stock already exists for this product', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(mockProduct());
      // existing global stock
      (prisma.stock.findFirst as jest.Mock).mockResolvedValue(mockStock());

      await expect(
        service.create(ORG_ID, USER_ID, {
          productId: PRODUCT_ID,
          supplierId: SUPPLIER_ID,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates a per-pickup-point stock entry (does not check global uniqueness)', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(mockProduct());
      // Pickup point has no supplier scope (shared point)
      (prisma.pickupPoint.findFirst as jest.Mock).mockResolvedValue({ id: PICKUP_POINT_ID, supplierId: null });
      const created = mockStock({ pickupPointId: PICKUP_POINT_ID, quantity: 20 });
      (prisma.stock.create as jest.Mock).mockResolvedValue(created);

      const result = await service.create(ORG_ID, USER_ID, {
        productId: PRODUCT_ID,
        supplierId: SUPPLIER_ID,
        pickupPointId: PICKUP_POINT_ID,
        quantity: 20,
      });

      expect(result.pickupPointId).toBe(PICKUP_POINT_ID);
      // stock.findFirst for global check should NOT have been called
      expect(prisma.stock.findFirst).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when pickup point is scoped to a different supplier', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(mockProduct());
      // Pickup point belongs to OTHER_SUPPLIER_ID, not SUPPLIER_ID
      (prisma.pickupPoint.findFirst as jest.Mock).mockResolvedValue({
        id: PICKUP_POINT_ID,
        supplierId: OTHER_SUPPLIER_ID,
      });

      await expect(
        service.create(ORG_ID, USER_ID, {
          productId: PRODUCT_ID,
          supplierId: SUPPLIER_ID,
          pickupPointId: PICKUP_POINT_ID,
          quantity: 10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when product does not belong to supplier/org', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.product.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.create(ORG_ID, USER_ID, {
          productId: 'wrong-product',
          supplierId: SUPPLIER_ID,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── update ──────────────────────────────────────────────────

  describe('update', () => {
    it('updates quantity', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.stock.findFirst as jest.Mock).mockResolvedValue(mockStock({ quantity: 10 }));
      const updated = mockStock({ quantity: 25 });
      (prisma.stock.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.update(ORG_ID, STOCK_ID, USER_ID, { quantity: 25 });
      expect(result.quantity).toBe(25);
    });

    it('auto-sets isAvailable = false when quantity drops to 0', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.stock.findFirst as jest.Mock).mockResolvedValue(mockStock({ quantity: 5, isAvailable: true }));
      const updated = mockStock({ quantity: 0, isAvailable: false });
      (prisma.stock.update as jest.Mock).mockResolvedValue(updated);

      await service.update(ORG_ID, STOCK_ID, USER_ID, { quantity: 0 });

      const updateCall = (prisma.stock.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data.isAvailable).toBe(false);
    });

    it('throws NotFoundException for unknown stock entry', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.stock.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(
        service.update(ORG_ID, 'bad-id', USER_ID, { quantity: 5 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── updateAvailability ──────────────────────────────────────

  describe('updateAvailability', () => {
    it('OPERATOR can mark a product unavailable', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(
        { userId: USER_ID, organizationId: ORG_ID, orgRole: 'OPERATOR' },
      );
      (prisma.stock.findFirst as jest.Mock).mockResolvedValue(mockStock({ quantity: 5 }));
      const updated = mockStock({ isAvailable: false });
      (prisma.stock.update as jest.Mock).mockResolvedValue(updated);

      const result = await service.updateAvailability(ORG_ID, STOCK_ID, USER_ID, {
        isAvailable: false,
      });

      expect(result.isAvailable).toBe(false);
    });

    it('cannot mark available = true when quantity is 0', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(mockMember());
      (prisma.stock.findFirst as jest.Mock).mockResolvedValue(mockStock({ quantity: 0, isAvailable: false }));
      const updated = mockStock({ quantity: 0, isAvailable: false });
      (prisma.stock.update as jest.Mock).mockResolvedValue(updated);

      await service.updateAvailability(ORG_ID, STOCK_ID, USER_ID, { isAvailable: true });

      const updateCall = (prisma.stock.update as jest.Mock).mock.calls[0][0];
      // Must be forced to false regardless of dto value
      expect(updateCall.data.isAvailable).toBe(false);
    });
  });
});
