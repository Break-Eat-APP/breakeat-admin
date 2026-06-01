import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Validates the Bearer JWT from the Authorization header.
 * Attaches the decoded payload (JwtPayload) to request.user.
 *
 * Usage: @UseGuards(JwtAuthGuard)
 *
 * On failure: throws 401 UnauthorizedException automatically.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
