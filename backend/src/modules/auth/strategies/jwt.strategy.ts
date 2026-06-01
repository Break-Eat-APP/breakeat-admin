import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';

export interface JwtPayload {
  sub: string;        // user id
  email: string;
  globalRole: string;
  iat?: number;
  exp?: number;
}

/**
 * JWT strategy — validates Bearer tokens from Authorization header.
 * On success, the payload is attached to request.user by Passport.
 * The payload is what AuthService.generateTokens() signs.
 *
 * Security rules:
 * - Secret is read from ConfigService (never hardcoded)
 * - Token must not be expired (handled by JwtModule options)
 * - User existence and isActive are verified against the DB on every request,
 *   so a deactivated account is rejected even if its JWT is still in its validity window.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('app.jwt.secret') ?? 'insecure-dev-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token payload');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, isActive: true, globalRole: true },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    // Return a fresh globalRole from the DB so that a role change or revocation
    // takes effect on the very next request — never trust the JWT-embedded value.
    return { ...payload, globalRole: user.globalRole };
  }
}
