import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { GlobalRole, OrgRole } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../../database/prisma.service';
import { UsersService } from '../users/users.service';
import { GroupsService } from '../groups/groups.service';
import type { SafeUser } from '../users/users.service';
import { SocialIdentityService, type Fournisseur } from './social-identity.service';
import {
  adresseSupprimee,
  libererCompteArchive,
} from '../../common/helpers/liberation-archives';
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

  /**
   * Complète le nom d'un compte SANS jamais écraser ce qui existe.
   *
   * Google renvoie le nom à chaque connexion : un compte créé avant que l'on
   * sache le lire se remplit donc tout seul, à la prochaine ouverture. Mais si
   * le client a corrigé son prénom dans Break Eat, c'est le sien qui reste —
   * un fournisseur ne doit pas réécrire par-dessus une saisie humaine.
   */
  private async completerNom(
    compte: { id: string; firstName: string | null; lastName: string | null },
    prenom: string | null,
    nom: string | null,
  ) {
    const manquants: { firstName?: string; lastName?: string } = {};
    if (!compte.firstName && prenom) manquants.firstName = prenom;
    if (!compte.lastName && nom) manquants.lastName = nom;
    if (Object.keys(manquants).length === 0) return compte as never;

    this.logger.log(`Nom complété sur le compte ${compte.id} (${Object.keys(manquants).join(', ')})`);
    return this.prisma.user.update({ where: { id: compte.id }, data: manquants });
  }

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
      firstName: dto.firstName,
      lastName: dto.lastName,
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

    // Un compte archivé ne se rouvre pas par son ancien mot de passe. Mais le
    // client doit savoir qu'il peut revenir : l'inscription avec la même
    // adresse lui ouvre un compte neuf (voir liberation-archives).
    if (!user.isActive) {
      throw new UnauthorizedException('Ce compte a été archivé. Vous pouvez vous réinscrire avec la même adresse : un nouveau compte sera créé.');
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
    firstName?: string;
    lastName?: string;
  }): Promise<AuthResponse> {
    // Chaque issue laisse une trace. Sans cela, une connexion REUSSIE sur un
    // compte existant etait muette : « aucune ligne » ne distinguait plus une
    // requete jamais arrivee d'une connexion reussie suivie d'une autre panne.
    this.logger.log(`Connexion ${dto.provider} : demande reçue`);
    const identite = await this.socialIdentity.verifier(dto.provider, dto.token);

    // D'où vient le nom, selon le fournisseur : Google l'écrit dans le jeton,
    // Apple le remet à l'application (et une seule fois). On prend ce qui
    // arrive, de l'un ou de l'autre.
    const propre = (v?: string | null) => {
      const t = v?.trim();
      return t ? t : null;
    };
    const prenom = propre(identite.firstName) ?? propre(dto.firstName);
    const nom = propre(identite.lastName) ?? propre(dto.lastName);

    let existante = await this.prisma.userIdentity.findUnique({
      where: {
        provider_subject: { provider: identite.provider, subject: identite.subject },
      },
      include: { user: true },
    });

    let user: SafeUser;

    // Le sujet mène à un compte ARCHIVÉ : la personne revient. Le compte
    // archivé rend son identité et son adresse, et elle repart d'un compte
    // neuf — exactement comme par l'inscription e-mail.
    if (existante && !existante.user.isActive) {
      await libererCompteArchive(this.prisma, { id: existante.user.id });
      this.logger.log(
        `Connexion ${dto.provider} : compte archivé ${existante.user.id} libéré, un compte neuf va être créé`,
      );
      existante = null;
    }

    if (existante) {
      user = sansMotDePasse(existante.user);
      this.logger.log(`Connexion ${dto.provider} réussie : compte existant ${user.id}`);
    } else {
      if (!identite.email || !identite.emailVerifie) {
        this.logger.warn(
          `Connexion ${identite.provider} refusée : adresse ` +
            (identite.email ? 'NON certifiée par le fournisseur' : 'ABSENTE du jeton') +
            ` (sujet ${identite.subject.slice(0, 8)}…)`,
        );
        // Sans adresse certifiée, impossible de créer un compte (l'adresse est
        // la clé) ni de rattacher sans risque. Apple en fournit toujours une à
        // la première autorisation : y arriver signifie que quelque chose s'est
        // perdu en route.
        throw new UnauthorizedException(
          'Le fournisseur n’a pas transmis d’adresse e-mail vérifiée.',
        );
      }

      // Un compte archivé qui porte cette adresse la rend d'abord.
      const libere = await libererCompteArchive(this.prisma, { email: identite.email });
      if (libere) {
        this.logger.log(`Connexion ${dto.provider} : adresse libérée par le compte archivé ${libere}`);
      }

      const deja = await this.prisma.user.findUnique({ where: { email: identite.email } });

      if (deja) {
        // Ne peut plus être archivé ici — il vient d'être libéré — sauf archivage
        // concurrent entre les deux lectures. Refuser reste alors la seule issue.
        if (!deja.isActive) {
          this.logger.warn(`Connexion ${dto.provider} refusée : compte ${deja.id} archivé`);
          throw new UnauthorizedException('Ce compte a été archivé. Vous pouvez vous réinscrire avec la même adresse : un nouveau compte sera créé.');
        }
        user = sansMotDePasse(await this.completerNom(deja, prenom, nom));
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
            // Pré-remplissent la commande chez Flaix. Sans eux, le client
            // retape son identité à chaque match.
            firstName: prenom,
            lastName: nom,
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
      throw new UnauthorizedException('Ce compte a été désactivé.');
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
   * Le client corrige SON profil — prénom, nom, téléphone.
   *
   * Pourquoi cette route existe : jusqu'ici, rien ne permettait d'ajouter un
   * numéro après coup. Un compte ouvert par Apple ou Google n'en a JAMAIS
   * (aucun des deux fournisseurs ne le donne), et ces coordonnées sont
   * exactement ce que la page de commande Flaix demande. Sans elles, le
   * client les retape à chaque match.
   *
   * Un champ laissé VIDE efface la valeur : c'est la seule façon pour un
   * client de retirer un numéro qu'il ne veut plus voir partir chez un
   * partenaire. Un champ ABSENT, lui, ne touche à rien.
   */
  async mettreAJourProfil(
    userId: string,
    dto: { firstName?: string; lastName?: string; phone?: string; displayName?: string },
  ): Promise<SafeUser> {
    const net = (v?: string) => {
      if (v === undefined) return undefined;
      const t = v.trim();
      return t === '' ? null : t;
    };

    // Typé à la main : `displayName` n'est PAS nullable en base, les trois
    // autres le sont. Un objet construit par étalement perdrait cette nuance
    // et ferait passer un `null` là où la colonne le refuse.
    const data: {
      firstName?: string | null;
      lastName?: string | null;
      phone?: string | null;
      displayName?: string;
    } = {};

    const prenom = net(dto.firstName);
    const nom = net(dto.lastName);
    const tel = net(dto.phone);
    const affiche = net(dto.displayName);

    if (prenom !== undefined) data.firstName = prenom;
    if (nom !== undefined) data.lastName = nom;
    if (tel !== undefined) data.phone = tel;
    // Le nom d'affichage ne se vide pas : il est en tête de « Mes commandes »,
    // et un vide y laisserait un trou sans explication.
    if (affiche) data.displayName = affiche;

    if (Object.keys(data).length === 0) return this.usersService.findById(userId);

    const maj = await this.prisma.user.update({ where: { id: userId }, data });
    this.logger.log(
      `Profil mis a jour (${Object.keys(data).join(', ')}) sur le compte ${userId}`,
    );
    return sansMotDePasse(maj);
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

  /**
   * LE CLIENT SUPPRIME SON COMPTE.
   *
   * Exigé par Apple (règle 5.1.1(v)) : une app qui permet de créer un compte
   * doit permettre de le supprimer DANS l'app, et les données personnelles
   * doivent réellement partir — une désactivation ne suffit pas.
   *
   * ON ANONYMISE, ON N'EFFACE PAS LA LIGNE. Deux raisons, et la seconde suffit
   * à elle seule :
   *
   *  · la base REFUSE d'effacer un compte qui porte des commandes
   *    (`Order.user` n'a pas de cascade, et c'est délibéré) ;
   *  · effacer ces commandes retirerait leur montant de la comptabilité du
   *    club, des déclarations de TVA et des reçus déjà remis. Le client a le
   *    droit de disparaître, pas de réécrire les comptes de quelqu'un d'autre.
   *
   * Ce qui part : le nom, le prénom, le téléphone, l'adresse, le mot de passe,
   * les connexions Apple/Google, les sessions, les jetons push, les paniers,
   * les notifications reçues, les appartenances aux clubs et aux groupes.
   * Ce qui reste : les commandes et leurs paiements, rattachés à une ligne qui
   * ne désigne plus personne.
   *
   * L'adresse est LIBÉRÉE : se réinscrire plus tard crée un compte neuf, sans
   * aucun lien avec l'ancien. C'est déjà la règle de l'archivage, et pour la
   * même raison — l'app ne vérifie pas les adresses, rendre l'historique à qui
   * sait taper une adresse serait le donner.
   */
  async supprimerMonCompte(userId: string): Promise<{ supprime: true }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, globalRole: true },
    });
    if (!user) throw new NotFoundException('Compte introuvable.');

    // ── Deux portes qu'on ne se laisse pas claquer dans le dos.
    //
    // Elles ne concernent jamais un client : il n'est ni administrateur de la
    // plateforme, ni administrateur d'un club. Un examinateur de l'App Store
    // crée un compte ordinaire — sa suppression passe sans rien rencontrer.
    if (user.globalRole === GlobalRole.SUPER_ADMIN) {
      const autres = await this.prisma.user.count({
        where: { globalRole: GlobalRole.SUPER_ADMIN, isActive: true, id: { not: userId } },
      });
      if (autres === 0) {
        throw new BadRequestException(
          'Ce compte est le dernier administrateur de la plateforme : le supprimer rendrait ' +
            'le back-office inaccessible. Nommez un autre administrateur d’abord.',
        );
      }
    }

    const administre = await this.prisma.organizationMember.findMany({
      where: { userId, orgRole: OrgRole.ORG_ADMIN },
      select: { organizationId: true, organization: { select: { name: true } } },
    });
    for (const m of administre) {
      const autres = await this.prisma.organizationMember.count({
        where: {
          organizationId: m.organizationId,
          orgRole: OrgRole.ORG_ADMIN,
          userId: { not: userId },
          user: { isActive: true },
        },
      });
      if (autres === 0) {
        throw new BadRequestException(
          `Ce compte est le dernier administrateur de « ${m.organization.name} » : le supprimer ` +
            'laisserait ce club sans personne pour le gérer. Nommez un autre administrateur, ' +
            'puis réessayez.',
        );
      }
    }

    // UNE transaction : un compte à moitié anonymisé — nom effacé mais session
    // toujours valable, ou l'inverse — serait pire que l'état de départ, et
    // invisible depuis l'écran qui vient d'annoncer « compte supprimé ».
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          email: adresseSupprimee(userId),
          // `archivedEmail` reste NUL : c'est là qu'un archivage conserve
          // l'adresse d'origine. Une suppression n'a rien à conserver.
          archivedEmail: null,
          displayName: 'Compte supprimé',
          firstName: null,
          lastName: null,
          phone: null,
          passwordHash: null,
          isActive: false,
        },
      }),
      this.prisma.userIdentity.deleteMany({ where: { userId } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.pushToken.deleteMany({ where: { userId } }),
      this.prisma.cart.deleteMany({ where: { userId } }),
      this.prisma.userNotification.deleteMany({ where: { userId } }),
      this.prisma.groupMember.deleteMany({ where: { userId } }),
      this.prisma.organizationMember.deleteMany({ where: { userId } }),
    ]);

    // Le journal garde l'IDENTIFIANT, jamais l'adresse : la tracer ici
    // reconstituerait ce qu'on vient d'effacer, dans un fichier qu'on
    // conserve bien plus longtemps que la base.
    this.logger.warn(`Compte ${userId} SUPPRIMÉ à la demande de son titulaire.`);
    return { supprime: true };
  }
}
