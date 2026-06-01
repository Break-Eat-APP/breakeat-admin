import { Test, TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../../database/prisma.service';
import { OrgRole } from '../../common/enums/role.enum';

// ─── Helpers ─────────────────────────────────────────────────

const ORG_ID = 'org-1';
const CALLER_ID = 'caller-1';
const TARGET_ID = 'target-1';

function mockOrg(memberUserIds: string[] = [CALLER_ID]) {
  return {
    id: ORG_ID,
    name: 'Test Org',
    slug: 'test-org',
    status: 'ACTIVE',
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    members: memberUserIds.map((userId) => ({
      userId,
      organizationId: ORG_ID,
      orgRole: OrgRole.ORG_ADMIN,
      createdAt: new Date(),
    })),
  };
}

function mockMembership(orgRole = OrgRole.ORG_ADMIN) {
  return { userId: CALLER_ID, organizationId: ORG_ID, orgRole };
}

// ─── Tests ────────────────────────────────────────────────────

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: PrismaService,
          useValue: {
            organization: {
              findUnique: jest.fn(),
              create: jest.fn(),
              findUniqueOrThrow: jest.fn(),
            },
            organizationMember: {
              findUnique: jest.fn(),
              create: jest.fn(),
            },
            user: { findUnique: jest.fn() },
            $transaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
    prisma = module.get(PrismaService);
  });

  // ─── findById ────────────────────────────────────────────────

  describe('findById', () => {
    it('returns org when caller is a member', async () => {
      const org = mockOrg([CALLER_ID]);
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(org);

      const result = await service.findById(ORG_ID, CALLER_ID, 'CUSTOMER');
      expect(result).toEqual(org);
    });

    it('throws NotFoundException when org does not exist', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findById(ORG_ID, CALLER_ID, 'CUSTOMER')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when caller is not a member', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(mockOrg([]));

      await expect(service.findById(ORG_ID, CALLER_ID, 'CUSTOMER')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('SUPER_ADMIN can view an org they are not a member of', async () => {
      // Org has NO members for CALLER_ID
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(mockOrg([]));

      const result = await service.findById(ORG_ID, CALLER_ID, 'SUPER_ADMIN');
      expect(result).toBeDefined();
    });
  });

  // ─── addMember ───────────────────────────────────────────────

  describe('addMember', () => {
    it('adds member when caller is ORG_ADMIN', async () => {
      (prisma.organizationMember.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMembership(OrgRole.ORG_ADMIN)) // caller check
        .mockResolvedValueOnce(null);                              // duplicate check
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: TARGET_ID });
      const created = { userId: TARGET_ID, organizationId: ORG_ID, orgRole: OrgRole.MANAGER };
      (prisma.organizationMember.create as jest.Mock).mockResolvedValue(created);

      const result = await service.addMember(ORG_ID, CALLER_ID, 'CUSTOMER', TARGET_ID, OrgRole.MANAGER);
      expect(result).toEqual(created);
    });

    it('throws ForbiddenException when caller is not ORG_ADMIN', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce(
        mockMembership(OrgRole.OPERATOR),
      );

      await expect(
        service.addMember(ORG_ID, CALLER_ID, 'CUSTOMER', TARGET_ID, OrgRole.MANAGER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when caller has no membership', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.addMember(ORG_ID, CALLER_ID, 'CUSTOMER', TARGET_ID, OrgRole.MANAGER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when target user does not exist', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce(
        mockMembership(OrgRole.ORG_ADMIN),
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null); // target not found

      await expect(
        service.addMember(ORG_ID, CALLER_ID, 'CUSTOMER', TARGET_ID, OrgRole.MANAGER),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when target is already a member', async () => {
      (prisma.organizationMember.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMembership(OrgRole.ORG_ADMIN)) // caller check
        .mockResolvedValueOnce({ userId: TARGET_ID });              // duplicate found
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: TARGET_ID });

      await expect(
        service.addMember(ORG_ID, CALLER_ID, 'CUSTOMER', TARGET_ID, OrgRole.MANAGER),
      ).rejects.toThrow(ConflictException);
    });

    it('SUPER_ADMIN can add member without being ORG_ADMIN', async () => {
      // organizationMember.findUnique should NOT be called for caller check
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: TARGET_ID });
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce(null); // duplicate check
      const created = { userId: TARGET_ID, organizationId: ORG_ID, orgRole: OrgRole.MANAGER };
      (prisma.organizationMember.create as jest.Mock).mockResolvedValue(created);

      const result = await service.addMember(
        ORG_ID,
        CALLER_ID,
        'SUPER_ADMIN',
        TARGET_ID,
        OrgRole.MANAGER,
      );
      expect(result).toEqual(created);
    });
  });
});
