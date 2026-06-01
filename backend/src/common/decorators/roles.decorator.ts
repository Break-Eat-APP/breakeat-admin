import { SetMetadata } from '@nestjs/common';
import type { GlobalRole } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

/**
 * Attaches required global roles to a route handler.
 * Usage: @Roles(GlobalRole.SUPER_ADMIN)
 *
 * Enforced by RolesGuard — must be used together with JwtAuthGuard.
 */
export const Roles = (...roles: GlobalRole[]) => SetMetadata(ROLES_KEY, roles);
