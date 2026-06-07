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
import { GroupMemberSource, EventVisibility } from '@prisma/client';
import type { Group, GroupMember } from '@prisma/client';
import type { CreateGroupDto } from './dto/create-group.dto';
import type { UpdateGroupDto } from './dto/update-group.dto';

/**
 * GroupsService — user segments scoped to ONE organisation.
 *
 * Access rules (org-scoped, via requireOrgAccess; SUPER_ADMIN bypasses):
 * - Read  (list, members): any org member (ALL_ORG_ROLES)
 * - Write (create/update/delete, add/remove member): ORG_ADMIN or MANAGER
 *
 * Group membership has two sources:
 * - MANUAL : added by email by an admin
 * - DOMAIN : auto-joined because the user's email matches the group's emailDomain.
 *
 * Groups gate access to PRIVATE events (Phase 14.4). The domain helpers below
 * are also consumed by AuthService so new sign-ups auto-join matching groups.
 */
@Injectable()
export class GroupsService {
  private readonly logger = new Logger(GroupsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ─── Groups CRUD ──────────────────────────────────────────────

  async create(organizationId: string, userId: string, dto: CreateGroupDto): Promise<Group> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const emailDomain = GroupsService.normalizeDomain(dto.emailDomain);

    let group: Group;
    try {
      group = await this.prisma.group.create({
        data: {
          organizationId,
          name: dto.name,
          description: dto.description?.trim() || null,
          emailDomain,
        },
      });
    } catch (err: unknown) {
      throw GroupsService.mapKnownError(err, 'A group with this name already exists in this organization');
    }

    // Backfill existing users that already match the domain rule.
    if (emailDomain) {
      const added = await this.backfillDomainMembers(group.id, emailDomain);
      if (added > 0) this.logger.log(`Group ${group.id}: domain backfill enrolled ${added} user(s)`);
    }

    this.logger.log(`Group created: ${group.id} ("${group.name}") in org ${organizationId}`);
    return group;
  }

  async findAllByOrg(organizationId: string, userId: string) {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    return this.prisma.group.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { members: true, events: true } } },
    });
  }

  async findOne(organizationId: string, groupId: string, userId: string) {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);
    return this.requireGroupInOrg(groupId, organizationId);
  }

  async update(
    organizationId: string,
    groupId: string,
    userId: string,
    dto: UpdateGroupDto,
  ): Promise<Group> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);
    await this.requireGroupInOrg(groupId, organizationId);

    const nextDomain =
      dto.emailDomain !== undefined ? GroupsService.normalizeDomain(dto.emailDomain) : undefined;

    let updated: Group;
    try {
      updated = await this.prisma.group.update({
        where: { id: groupId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.description !== undefined && { description: dto.description.trim() || null }),
          ...(nextDomain !== undefined && { emailDomain: nextDomain }),
        },
      });
    } catch (err: unknown) {
      throw GroupsService.mapKnownError(err, 'A group with this name already exists in this organization');
    }

    // If a (new) domain rule was set, backfill matching users.
    if (nextDomain) {
      const added = await this.backfillDomainMembers(groupId, nextDomain);
      if (added > 0) this.logger.log(`Group ${groupId}: domain backfill enrolled ${added} user(s)`);
    }

    this.logger.log(`Group updated: ${groupId} in org ${organizationId}`);
    return updated;
  }

  async remove(organizationId: string, groupId: string, userId: string): Promise<void> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);
    await this.requireGroupInOrg(groupId, organizationId);

    // Cascades remove group_members and event_groups rows.
    await this.prisma.group.delete({ where: { id: groupId } });
    this.logger.log(`Group deleted: ${groupId} in org ${organizationId}`);
  }

  // ─── Members ──────────────────────────────────────────────────

  async listMembers(organizationId: string, groupId: string, userId: string) {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);
    await this.requireGroupInOrg(groupId, organizationId);

    return this.prisma.groupMember.findMany({
      where: { groupId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, email: true, displayName: true } } },
    });
  }

  async addMemberByEmail(
    organizationId: string,
    groupId: string,
    userId: string,
    email: string,
  ): Promise<GroupMember> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);
    await this.requireGroupInOrg(groupId, organizationId);

    const target = await this.prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      select: { id: true },
    });
    if (!target) {
      throw new NotFoundException('No user found with this email address');
    }

    try {
      const member = await this.prisma.groupMember.create({
        data: { groupId, userId: target.id, source: GroupMemberSource.MANUAL },
      });
      this.logger.log(`Group ${groupId}: added member ${target.id} (MANUAL)`);
      return member;
    } catch (err: unknown) {
      throw GroupsService.mapKnownError(err, 'This user is already a member of the group');
    }
  }

  async removeMember(
    organizationId: string,
    groupId: string,
    userId: string,
    targetUserId: string,
  ): Promise<void> {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);
    await this.requireGroupInOrg(groupId, organizationId);

    const existing = await this.prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });
    if (!existing) throw new NotFoundException('Membership not found');

    await this.prisma.groupMember.delete({
      where: { groupId_userId: { groupId, userId: targetUserId } },
    });
    this.logger.log(`Group ${groupId}: removed member ${targetUserId}`);
  }

  // ─── Domain auto-join (consumed by AuthService — Phase 14.3) ──

  /**
   * Enrols `userId` into EVERY group (any org) whose emailDomain matches the
   * given email. Idempotent (skipDuplicates). Called on register / login.
   * Returns the number of new memberships created.
   */
  async applyDomainMembershipsForUser(userId: string, email: string): Promise<number> {
    const domain = GroupsService.domainOf(email);
    if (!domain) return 0;

    const groups = await this.prisma.group.findMany({
      where: { emailDomain: domain },
      select: { id: true },
    });
    if (groups.length === 0) return 0;

    const result = await this.prisma.groupMember.createMany({
      data: groups.map((g) => ({ groupId: g.id, userId, source: GroupMemberSource.DOMAIN })),
      skipDuplicates: true,
    });
    if (result.count > 0) {
      this.logger.log(`User ${userId}: domain auto-join into ${result.count} group(s) for "${domain}"`);
    }
    return result.count;
  }

  /**
   * Enrols all EXISTING users whose email ends with the group's domain.
   * Idempotent. Returns the number of new memberships created.
   */
  private async backfillDomainMembers(groupId: string, emailDomain: string): Promise<number> {
    const users = await this.prisma.user.findMany({
      where: { email: { endsWith: `@${emailDomain}`, mode: 'insensitive' } },
      select: { id: true },
    });
    if (users.length === 0) return 0;

    const result = await this.prisma.groupMember.createMany({
      data: users.map((u) => ({ groupId, userId: u.id, source: GroupMemberSource.DOMAIN })),
      skipDuplicates: true,
    });
    return result.count;
  }

  // ─── Private-event access gating (Phase 14.4) ────────────────

  /**
   * Single source of truth for PRIVATE-event gating. Consumed by the public
   * events controller (browse) and the cart service (create / checkout).
   *
   * - PUBLIC events: accessible to everyone, including anonymous browsers.
   * - PRIVATE events: accessible only to an authenticated user who belongs to
   *   at least one group linked to the event (via the EventGroup join).
   *
   * Returns false for an unknown event so callers can fold "missing" and
   * "not a member" into one identical 404 — never leaking that a PRIVATE event
   * exists to someone who isn't allowed to see it.
   */
  async canAccessEvent(eventId: string, userId: string | null): Promise<boolean> {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      select: { visibility: true },
    });
    if (!event) return false;
    if (event.visibility === EventVisibility.PUBLIC) return true;
    if (!userId) return false;

    const membership = await this.prisma.groupMember.findFirst({
      where: { userId, group: { events: { some: { eventId } } } },
      select: { groupId: true },
    });
    return membership !== null;
  }

  // ─── Private helpers ──────────────────────────────────────────

  private async requireGroupInOrg(groupId: string, organizationId: string): Promise<Group> {
    const group = await this.prisma.group.findFirst({
      where: { id: groupId, organizationId },
    });
    if (!group) throw new NotFoundException('Group not found in this organization');
    return group;
  }

  /** Lowercases, trims, strips a leading "@". Empty → null. */
  static normalizeDomain(input?: string | null): string | null {
    if (input === undefined || input === null) return null;
    const cleaned = input.trim().replace(/^@/, '').toLowerCase();
    return cleaned.length > 0 ? cleaned : null;
  }

  /** Extracts the lowercased domain part of an email, or null. */
  static domainOf(email: string): string | null {
    const at = email.lastIndexOf('@');
    if (at < 0) return null;
    const domain = email.slice(at + 1).trim().toLowerCase();
    return domain.length > 0 ? domain : null;
  }

  /** Maps Prisma P2002 (unique) to a 409; rethrows anything else. */
  private static mapKnownError(err: unknown, conflictMessage: string): unknown {
    if (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === 'P2002'
    ) {
      return new ConflictException(conflictMessage);
    }
    return err;
  }
}
