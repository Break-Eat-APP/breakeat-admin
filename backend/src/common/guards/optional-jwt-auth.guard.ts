import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Like JwtAuthGuard, but NEVER rejects the request.
 *
 * - Valid Bearer token  → request.user is the decoded JwtPayload.
 * - Missing / invalid / expired token → request.user stays undefined, request proceeds.
 *
 * Used on otherwise-public endpoints that must still recognise a logged-in
 * customer — e.g. PRIVATE-event browsing, where an anonymous visitor is allowed
 * to hit the route but only a group member gets a non-404 response.
 *
 * Routes using this guard MUST treat the user as optional:
 *   @CurrentUser() user?: JwtPayload
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Passport calls this with the strategy result. The base class throws when
   * `user` is falsy; we override that so a failed/absent token simply yields
   * `undefined` instead of a 401.
   */
  handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser {
    return (user || undefined) as TUser;
  }
}
