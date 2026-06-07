import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import type { User } from '@prisma/client';
import * as argon2 from 'argon2';

export interface CreateUserInput {
  email: string;
  password: string;
  displayName: string;
  phone?: string;
}

export type SafeUser = Omit<User, 'passwordHash'>;

/**
 * UsersService owns all user persistence logic.
 * AuthService calls this — controllers never call it directly for auth flows.
 *
 * Rule: never return passwordHash outside this service.
 * All public methods return SafeUser (passwordHash excluded).
 */
@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new user with a hashed password.
   * Throws ConflictException if email already exists.
   */
  async create(input: CreateUserInput): Promise<SafeUser> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });

    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await argon2.hash(input.password);

    const user = await this.prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        passwordHash,
        displayName: input.displayName,
        phone: input.phone,
      },
    });

    return this.toSafeUser(user);
  }

  /**
   * Finds a user by email.
   * Returns null if not found (not an exception — used by AuthService for login).
   * Includes passwordHash for internal auth validation only.
   */
  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });
  }

  /**
   * Finds a user by id.
   * Throws NotFoundException if not found.
   */
  async findById(id: string): Promise<SafeUser> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.toSafeUser(user);
  }

  /**
   * Finds a user by id and includes their organisation memberships.
   * Used by GET /auth/me/memberships — returns the same SafeUser shape
   * extended with an `memberships` array (org id, role, org name/slug).
   * Used exclusively by the admin panel to identify which orgs the user belongs to.
   */
  async findByIdWithMemberships(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        memberships: {
          include: {
            organization: {
              select: { id: true, name: true, slug: true, status: true },
            },
            // Phase 12.7 — include assigned supplier so operator app can read supplierId
            supplier: {
              select: { id: true, name: true, status: true },
            },
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _hash, ...safeUser } = user;
    return safeUser;
  }

  /**
   * Validates a plain password against the stored hash.
   * Returns true if valid, false otherwise.
   * Used exclusively by AuthService.
   */
  async validatePassword(plainPassword: string, passwordHash: string): Promise<boolean> {
    return argon2.verify(passwordHash, plainPassword);
  }

  private toSafeUser(user: User): SafeUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash: _hash, ...safeUser } = user;
    return safeUser;
  }
}
