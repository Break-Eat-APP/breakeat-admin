import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../../modules/auth/strategies/jwt.strategy';

/**
 * Extracts the authenticated user from the request.
 * Usage: @CurrentUser() user: JwtPayload
 *
 * The JwtPayload is attached by JwtStrategy.validate() after token verification.
 * Only works on routes protected by JwtAuthGuard.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<Request & { user: JwtPayload }>();
    return request.user;
  },
);
