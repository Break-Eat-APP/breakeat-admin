import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { GroupsService } from '../groups/groups.service';
import type { SafeUser } from '../users/users.service';
import type { RegisterDto } from './dto/register.dto';
import type { LoginDto } from './dto/login.dto';
import type { JwtPayload } from './strategies/jwt.strategy';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
}

const REFRESH_TOKEN_EXPIRES_DAYS = 7;
const ACCESS_TOKEN_EXPIRES = '15m';

/**
 * AuthService owns all authentication logic.
 * Rules from ARCHITECTURE.md:
 * - Payment logic must not mix with auth logic
 * - Controllers stay thin — no business logic in controller
 * - Every important action must produce structured logs
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Registers a new user and returns tokens.
   * Throws ConflictException if email is taken (from UsersService).
   */
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      displayName: dto.displayName,
      phone: dto.phone,
    });

    // Phase 14 — auto-join any group whose emailDomain matches this address.
    await this.syncDomainGroups(user.id, user.email);

    const tokens = await this.generateTokens(user);

    this.logger.log(`User registered: ${user.id} (${user.email})`);

    return { user, ...tokens };
  }

  /**
   * Authenticates a user by email + password.
   * Always throws the same generic error (do not reveal if email exists).
   */
  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    const passwordValid = await this.usersService.validatePassword(
      dto.password,
      user.passwordHash,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _hash, ...safeUser } = user;

    // Phase 14 — keep domain-based group memberships in sync on every login
    // (covers users created before a matching group existed). Idempotent.
    await this.syncDomainGroups(safeUser.id, safeUser.email);

    const tokens = await this.generateTokens(safeUser);

    this.logger.log(`User logged in: ${user.id} (${user.email})`);

    return { user: safeUser, ...tokens };
  }

  /**
   * Rotates a refresh token.
   * Old token is deleted on use — prevents replay attacks.
   * Throws UnauthorizedException if token is invalid or expired.
   */
  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    const tokenHash = this.hashToken(rawRefreshToken);

    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: true },
    });

    if (!stored || stored.expiresAt < new Date()) {
      // Delete the token if it exists but is expired
      if (stored) {
        await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    // Rotate: delete old, issue new
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _hash, ...safeUser } = stored.user;
    const tokens = await this.generateTokens(safeUser);

    this.logger.log(`Token refreshed for user: ${stored.userId}`);

    return tokens;
  }

  /**
   * Invalidates a refresh token (logout).
   * No error if token not found — logout is idempotent.
   */
  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawRefreshToken);
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
  }

  /**
   * Returns the current user from their JWT payload.
   */
  async me(userId: string): Promise<SafeUser> {
    return this.usersService.findById(userId);
  }

  /**
   * Returns the user profile extended with all organisation memberships.
   * Used by GET /auth/me/memberships for the admin panel.
   * The admin panel calls this once after login to resolve which org the user manages.
   */
  async meWithMemberships(userId: string) {
    return this.usersService.findByIdWithMemberships(userId);
  }

  // ─── Private helpers ──────────────────────────────────────

  /**
   * Best-effort domain-based group enrolment. Never blocks auth: a failure here
   * is logged and swallowed so login/register still succeed.
   */
  private async syncDomainGroups(userId: string, email: string): Promise<void> {
    try {
      await this.groupsService.applyDomainMembershipsForUser(userId, email);
    } catch (err: unknown) {
      this.logger.warn(
        `Domain auto-join failed for user ${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async generateTokens(user: SafeUser): Promise<AuthTokens> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      globalRole: user.globalRole,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: ACCESS_TOKEN_EXPIRES,
    });

    const rawRefreshToken = crypto.randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(rawRefreshToken);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
