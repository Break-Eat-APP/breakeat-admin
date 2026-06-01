import { ForbiddenException } from '@nestjs/common';
import { GlobalRole, OrgRole } from '../enums/role.enum';
import type { PrismaService } from '../../database/prisma.service';

/** Roles that can manage (create, update) org resources. */
export const MANAGE_ROLES: OrgRole[] = [OrgRole.ORG_ADMIN, OrgRole.MANAGER];

/** All roles — any org member can read. */
export const ALL_ORG_ROLES: OrgRole[] = [
  OrgRole.ORG_ADMIN,
  OrgRole.MANAGER,
  OrgRole.OPERATOR,
  OrgRole.MARKETING,
];

/**
 * Verifies that `userId` is a member of `organizationId` with one of `allowedRoles`.
 *
 * SUPER_ADMIN bypasses all organisation-level checks — they can operate in any org
 * without holding a membership. Their globalRole is fetched from the DB so a revoked
 * SUPER_ADMIN is rejected even if their JWT is still valid.
 *
 * Throws `ForbiddenException` (403) if not a member or wrong role.
 * Throws nothing and returns void if the check passes.
 *
 * Use `MANAGE_ROLES` for write operations (ORG_ADMIN, MANAGER).
 * Use `ALL_ORG_ROLES` (default) for read operations.
 *
 * @example
 * await requireOrgAccess(this.prisma, userId, orgId, MANAGE_ROLES);
 */
export async function requireOrgAccess(
  prisma: PrismaService,
  userId: string,
  organizationId: string,
  allowedRoles: OrgRole[] = ALL_ORG_ROLES,
): Promise<void> {
  // SUPER_ADMIN bypasses all organisation-level access checks.
  // We query the DB (not the JWT) so that a role revocation takes effect immediately.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { globalRole: true },
  });
  if (user?.globalRole === GlobalRole.SUPER_ADMIN) return;

  const member = await prisma.organizationMember.findUnique({
    where: { userId_organizationId: { userId, organizationId } },
  });

  if (!member) {
    throw new ForbiddenException('Access denied: not a member of this organization');
  }

  if (!allowedRoles.includes(member.orgRole as OrgRole)) {
    throw new ForbiddenException(
      `Access denied: operation requires role in [${allowedRoles.join(', ')}]`,
    );
  }
}
