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
import { SocialIdentityService, type Fournisseur } from './social-identity.service';
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
/**
 * Le hachage ne sort JAMAIS du service.
 *
 * Trois chemins ramenaient une ligne complete depuis la base ; en oublier un
 * seul aurait envoye le hachage du mot de passe jusque dans l'application.
 */
function sansMotDePasse(ligne: SafeUser & { passwordHash?: string | null }): SafeUser {
  const copie = { ...ligne };
  delete copie.passwordHash;
  return copie;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly groupsService: GroupsService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly socialIdentity: SocialIdentityService,
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

    // Un compte créé par Apple ou Google n'a JAMAIS eu de mot de passe. Le
    // dire clairement évite au client de s'acharner sur un mot de passe qui
    // n'a jamais existé — et de demander une réinitialisation qui n'aboutirait
    // à rien.
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'Ce compte se connecte avec Apple ou Google.',
      );
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
   * Connexion par Apple ou Google.
   *
   * L'ordre compte, et c'est tout le sujet :
   *
   * 1. le SUJET du fournisseur d'abord — stable, il désigne le même humain même
   *    si son adresse a changé depuis ;
   * 2. l'adresse ensuite, et seulement si le fournisseur la certifie : elle
   *    rattache l'inscription rapide au compte déjà ouvert par mot de passe,
   *    pour que le client n'en découvre pas un second, vide de ses commandes ;
   * 3. la création enfin.
   *
   * Rattacher sur une adresse NON certifiée reviendrait à donner le compte de
   * quelqu'un à qui saurait en déclarer l'adresse. C'est exactement pour cela
   * que Facebook n'est pas branché ici : son jeton ne certifie pas l'adresse.
   */
  async connexionSociale(dto: {
    provider: Fournisseur;
    token: string;
    displayName?: string;
  }): Promise<AuthResponse> {
    const identite = await this.socialIdentity.verifier(dto.provider, dto.token);

    const existante = await this.prisma.userIdentity.findUnique({
      where: {
        provider_subject: { provider: identite.provider, subject: identite.subject },
      },
      include: { user: true },
    });

    let user: SafeUser;

    if (existante) {
      if (!existante.user.isActive) throw new UnauthorizedException('Account is disabled');
      user = sansMotDePasse(existante.user);
    } else {
      if (!identite.email || !identite.emailVerifie) {
        // Sans adresse certifiée, impossible de créer un compte (l'adresse est
        // la clé) ni de rattacher sans risque. Apple en fournit toujours une à
        // la première autorisation : y arriver signifie que quelque chose s'est
        // perdu en route.
        throw new UnauthorizedException(
          'Le fournisseur n’a pas transmis d’adresse e-mail vérifiée.',
        );
      }

      const deja = await this.prisma.user.findUnique({ where: { email: identite.email } });

      if (deja) {
        if (!deja.isActive) throw new UnauthorizedException('Account is disabled');
        user = sansMotDePasse(deja);
        this.logger.log(`Identité ${identite.provider} rattachée au compte ${user.id}`);
      } else {
        const cree = await this.prisma.user.create({
          data: {
            email: identite.email,
            // Aucun mot de passe : il n'y en a jamais eu.
            passwordHash: null,
            // Apple ne donne le nom qu'à la PREMIÈRE autorisation, et jamais
            // ensuite : s'il manque, la partie gauche de l'adresse vaut mieux
            // qu'un champ vide en tête de « Mes commandes ».
            displayName: dto.displayName?.trim() || identite.email.split('@')[0],
          },
        });
        user = sansMotDePasse(cree);
        this.logger.log(`Compte créé via ${identite.provider} : ${user.id}`);
      }

      await this.prisma.userIdentity.create({
        data: {
          userId: user.id,
          provider: identite.provider,
          subject: identite.subject,
          email: identite.email,
        },
      });
    }

    await this.syncDomainGroups(user.id, user.email);
    const tokens = await this.generateTokens(user);
    return { user, ...tokens };
  }

  /** Ce que l'application peut proposer — un bouton sans serveur derrière ment. */
  fournisseursDisponibles(): Fournisseur[] {
    return this.socialIdentity.disponibles();
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
      // `deleteMany` et non `delete` : la ligne peut avoir disparu entre la
      // lecture et la suppression, et un jeton deja parti n'est pas une panne.
      if (stored) {
        await this.prisma.refreshToken.deleteMany({ where: { id: stored.id } });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException('Account is disabled');
    }

    // Rotation : on retire l'ancien jeton avant d'en emettre un nouveau.
    //
    // `deleteMany` plutot que `delete`, et le compte est VERIFIE. Deux appels
    // simultanes (deux onglets, ou un ecran qui rejoue sa requete) lisaient le
    // meme jeton puis tentaient tous deux de le supprimer : le second levait
    // une erreur Prisma « No record was found for a delete », rendue au client
    // en 500. Une session perdue s'affichait donc comme une panne du serveur.
    //
    // Perdre la course signifie qu'un autre appel a deja consomme ce jeton :
    // c'est un refus d'authentification, pas une erreur interne.
    const rotation = await this.prisma.refreshToken.deleteMany({ where: { id: stored.id } });
    if (rotation.count === 0) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

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
