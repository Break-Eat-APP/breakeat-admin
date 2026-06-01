import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { GlobalRole, OrgRole } from '../../common/enums/role.enum';
import type { CreateOrganizationDto } from './dto/create-organization.dto';
import type { Organization, OrganizationMember } from '@prisma/client';

export type OrganizationWithMembers = Organization & {
  members: OrganizationMember[];
};

/**
 * OrganizationsService owns all organisation persistence logic.
 *
 * Rules:
 * - When a user creates an org, they automatically become ORG_ADMIN
 * - Only ORG_ADMIN (or SUPER_ADMIN) can add members
 * - Slug must be globally unique
 */
@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new organisation and adds the creator as ORG_ADMIN.
   * Runs in a transaction to ensure atomicity.
   */
  async create(
    creatorId: string,
    dto: CreateOrganizationDto,
  ): Promise<OrganizationWithMembers> {
    const existing = await this.prisma.organization.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException(`Slug "${dto.slug}" is already taken`);
    }

    const organization = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          settings: (dto.settings ?? {}) as object,
        },
      });

      await tx.organizationMember.create({
        data: {
          userId: creatorId,
          organizationId: org.id,
          orgRole: OrgRole.ORG_ADMIN,
        },
      });

      return tx.organization.findUniqueOrThrow({
        where: { id: org.id },
        include: { members: true },
      });
    });

    this.logger.log(`Organization created: ${organization.id} (${organization.slug}) by user ${creatorId}`);

    return organization;
  }

  /**
   * Returns an organisation by id.
   * Throws NotFoundException if not found.
   * Throws ForbiddenException if requesting user is not a member
   * (SUPER_ADMIN bypasses the membership check and can view any org).
   */
  async findById(
    id: string,
    requestingUserId: string,
    callerGlobalRole: string,
  ): Promise<OrganizationWithMembers> {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { members: true },
    });

    if (!org) throw new NotFoundException('Organization not found');

    // SUPER_ADMIN can view any organisation regardless of membership
    if (callerGlobalRole !== GlobalRole.SUPER_ADMIN) {
      const isMember = org.members.some((m) => m.userId === requestingUserId);
      if (!isMember) {
        throw new ForbiddenException('Access denied to this organization');
      }
    }

    return org;
  }

  /**
   * Adds a user as a member of an organisation.
   * Only ORG_ADMIN of that org (or SUPER_ADMIN) can call this.
   * Throws ForbiddenException if the caller lacks the required role.
   * Throws NotFoundException if the target user does not exist.
   * Throws ConflictException if the target is already a member.
   */
  async addMember(
    organizationId: string,
    callerId: string,
    callerGlobalRole: string,
    targetUserId: string,
    role: OrgRole,
  ): Promise<OrganizationMember> {
    // SUPER_ADMIN can add members to any org; otherwise caller must be ORG_ADMIN
    if (callerGlobalRole !== GlobalRole.SUPER_ADMIN) {
      const callerMembership = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: callerId, organizationId } },
      });
      if (!callerMembership || callerMembership.orgRole !== OrgRole.ORG_ADMIN) {
        throw new ForbiddenException('Only ORG_ADMIN can add members');
      }
    }

    // Verify the target user actually exists in the platform
    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    // Prevent duplicate membership
    const existing = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: targetUserId, organizationId } },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this organization');
    }

    const member = await this.prisma.organizationMember.create({
      data: { userId: targetUserId, organizationId, orgRole: role },
    });

    this.logger.log(
      `Member added: user ${targetUserId} → org ${organizationId} as ${role} (by ${callerId})`,
    );

    return member;
  }
}
