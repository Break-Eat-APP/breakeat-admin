import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { GlobalRole } from '../enums/role.enum';
import type { JwtPayload } from '../../modules/auth/strategies/jwt.strategy';

/**
 * Checks that the authenticated user has one of the required global roles.
 * Must be used AFTER JwtAuthGuard (which populates request.user).
 *
 * If no @Roles() decorator is present, the route is accessible to any authenticated user.
 *
 * Usage:
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles(GlobalRole.SUPER_ADMIN)
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<GlobalRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No @Roles() decorator — any authenticated user is allowed
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    const user = request.user;

    if (!user) return false;

    return requiredRoles.includes(user.globalRole as GlobalRole);
  }
}
