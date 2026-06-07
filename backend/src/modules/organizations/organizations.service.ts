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
import type { UpdateOrgBrandingDto } from './dto/update-org-branding.dto';
import type { Organization, OrganizationMember } from '@prisma/client';

export type OrganizationWithMembers = Organization & {
  members: OrganizationMember[];
};

/** Member row enriched with user info + optional supplier info. */
export type MemberWithDetails = OrganizationMember & {
  user: { id: string; email: string; displayName: string; globalRole: string };
  supplier: { id: string; name: string; status: string } | null;
};

/**
 * OrganizationsService owns all organisation persistence logic.
 *
 * Rules:
 * - When a user creates an org, they automatically become ORG_ADMIN
 * - Only ORG_ADMIN (or SUPER_ADMIN) can add/invite/remove members
 * - Slug must be globally unique
 * - OPERATOR members can be pinned to a specific supplier via supplierId
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
   * Returns all members of an organisation with user info + optional supplier info.
   * Any member can view the list; SUPER_ADMIN bypasses membership check.
   */
  async getMembers(
    organizationId: string,
    callerId: string,
    callerGlobalRole: string,
  ): Promise<MemberWithDetails[]> {
    if (callerGlobalRole !== GlobalRole.SUPER_ADMIN) {
      const callerMembership = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: callerId, organizationId } },
      });
      if (!callerMembership) {
        throw new ForbiddenException('Access denied to this organization');
      }
    }

    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: { select: { id: true, email: true, displayName: true, globalRole: true } },
        supplier: { select: { id: true, name: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Adds a user as a member of an organisation by userId.
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

  /**
   * Invites a user by email to join an organisation with a given role.
   * Only ORG_ADMIN (or SUPER_ADMIN) can invite.
   * For OPERATOR role, supplierId pins the operator to a specific supplier.
   * Throws NotFoundException if no user matches the email (they must register first).
   * Throws ConflictException if already a member.
   */
  async inviteByEmail(
    organizationId: string,
    callerId: string,
    callerGlobalRole: string,
    email: string,
    role: OrgRole,
    supplierId?: string,
  ): Promise<MemberWithDetails> {
    // Permission check
    if (callerGlobalRole !== GlobalRole.SUPER_ADMIN) {
      const callerMembership = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: callerId, organizationId } },
      });
      if (!callerMembership || callerMembership.orgRole !== OrgRole.ORG_ADMIN) {
        throw new ForbiddenException('Only ORG_ADMIN can invite members');
      }
    }

    // Find user by email
    const targetUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
    if (!targetUser) {
      throw new NotFoundException(
        `Aucun compte trouvé pour "${email}". Demandez-leur de créer un compte d'abord.`,
      );
    }

    // Prevent duplicate membership
    const existing = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: targetUser.id, organizationId } },
    });
    if (existing) {
      throw new ConflictException('Cet utilisateur est déjà membre de cette organisation');
    }

    // Validate supplier exists (if provided)
    if (supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier || supplier.organizationId !== organizationId) {
        throw new NotFoundException('Supplier not found in this organization');
      }
    }

    const member = await this.prisma.organizationMember.create({
      data: {
        userId: targetUser.id,
        organizationId,
        orgRole: role,
        supplierId: supplierId ?? null,
      },
      include: {
        user: { select: { id: true, email: true, displayName: true, globalRole: true } },
        supplier: { select: { id: true, name: true, status: true } },
      },
    });

    this.logger.log(
      `Member invited: ${targetUser.email} → org ${organizationId} as ${role}${supplierId ? ` (supplier ${supplierId})` : ''} (by ${callerId})`,
    );

    return member as MemberWithDetails;
  }

  /**
   * Updates the branding fields (logoUrl, primaryColor, description) of an organisation.
   * Only ORG_ADMIN (or SUPER_ADMIN) can update branding.
   */
  async updateBranding(
    organizationId: string,
    callerId: string,
    callerGlobalRole: string,
    dto: UpdateOrgBrandingDto,
  ): Promise<Organization> {
    if (callerGlobalRole !== GlobalRole.SUPER_ADMIN) {
      const callerMembership = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: callerId, organizationId } },
      });
      if (!callerMembership || callerMembership.orgRole !== OrgRole.ORG_ADMIN) {
        throw new ForbiddenException('Only ORG_ADMIN can update organization branding');
      }
    }

    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organization not found');

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });

    this.logger.log(`Organization branding updated: ${organizationId} (by ${callerId})`);
    return updated;
  }

  /**
   * Removes a member from an organisation.
   * Only ORG_ADMIN (or SUPER_ADMIN) can remove members.
   * Callers cannot remove themselves.
   */
  async removeMember(
    organizationId: string,
    memberId: string,
    callerId: string,
    callerGlobalRole: string,
  ): Promise<void> {
    if (callerGlobalRole !== GlobalRole.SUPER_ADMIN) {
      const callerMembership = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: callerId, organizationId } },
      });
      if (!callerMembership || callerMembership.orgRole !== OrgRole.ORG_ADMIN) {
        throw new ForbiddenException('Only ORG_ADMIN can remove members');
      }
    }

    const member = await this.prisma.organizationMember.findUnique({
      where: { id: memberId },
    });

    if (!member || member.organizationId !== organizationId) {
      throw new NotFoundException('Member not found');
    }

    if (member.userId === callerId) {
      throw new ForbiddenException('You cannot remove yourself from the organization');
    }

    await this.prisma.organizationMember.delete({ where: { id: memberId } });

    this.logger.log(`Member removed: ${memberId} from org ${organizationId} (by ${callerId})`);
  }
}
