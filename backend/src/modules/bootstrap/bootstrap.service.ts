import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'crypto';
import * as argon2 from 'argon2';
import { GlobalRole, OrgRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import type { BootstrapAdminDto } from './dto/bootstrap-admin.dto';

/**
 * Longueur minimale du secret d'amorçage.
 *
 * Cette route crée un compte tout-puissant : un secret court serait devinable
 * par force brute. On refuse donc de fonctionner en dessous de ce seuil plutôt
 * que de laisser une porte fragile ouverte.
 */
const MIN_SECRET_LENGTH = 24;

/**
 * BootstrapService — récupération de l'accès principal.
 *
 * Problème résolu : les mots de passe sont hachés (argon2) et ne peuvent donc
 * pas être relus. Si plus personne ne peut se connecter au back-office, il
 * n'existe aucun chemin applicatif pour reprendre la main.
 *
 * Conception défensive :
 *  - la route est INVISIBLE tant que `ADMIN_BOOTSTRAP_SECRET` n'est pas défini
 *    (404, comme si elle n'existait pas) — elle est donc inerte par défaut, y
 *    compris si ce code part en production sans configuration ;
 *  - le secret est comparé à temps constant ;
 *  - un secret trop court est refusé ;
 *  - chaque tentative est journalisée, réussie ou non, pour qu'un abus soit
 *    visible dans les logs.
 *
 * ⚠️ Le secret doit être RETIRÉ des variables d'environnement après usage :
 *    tant qu'il est présent, quiconque le connaît peut se créer un accès.
 */
@Injectable()
export class BootstrapService {
  private readonly logger = new Logger(BootstrapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Vérifie le secret d'amorçage.
   *
   * Absence de configuration ⇒ 404 (et non 401) : on ne révèle pas l'existence
   * de la route à qui la sonderait au hasard.
   */
  private assertSecret(provided: string | undefined): void {
    const expected = this.config.get<string>('app.bootstrapSecret') ?? '';

    if (!expected) {
      throw new NotFoundException('Cannot POST /api/v1/bootstrap/super-admin');
    }
    if (expected.length < MIN_SECRET_LENGTH) {
      this.logger.error(
        `ADMIN_BOOTSTRAP_SECRET trop court (${expected.length} caractères, minimum ${MIN_SECRET_LENGTH}) — amorçage refusé.`,
      );
      throw new UnauthorizedException('Secret d’amorçage invalide');
    }
    if (!provided || provided.length !== expected.length) {
      this.logger.warn('Tentative d’amorçage avec un secret absent ou de longueur incorrecte.');
      throw new UnauthorizedException('Secret d’amorçage invalide');
    }
    if (!timingSafeEqual(Buffer.from(provided, 'utf8'), Buffer.from(expected, 'utf8'))) {
      this.logger.warn('Tentative d’amorçage avec un secret erroné.');
      throw new UnauthorizedException('Secret d’amorçage invalide');
    }
  }

  /**
   * Crée (ou remet à niveau) un compte SUPER_ADMIN.
   *
   * Idempotent : un compte existant voit son mot de passe remplacé et son rôle
   * repassé à SUPER_ADMIN actif. Permet donc aussi bien la création initiale
   * que la reprise de main après oubli.
   */
  async createSuperAdmin(dto: BootstrapAdminDto, secret: string | undefined) {
    this.assertSecret(secret);

    const email = dto.email.trim().toLowerCase();
    const passwordHash = await argon2.hash(dto.password);
    const existed = Boolean(await this.prisma.user.findUnique({ where: { email } }));

    const user = await this.prisma.user.upsert({
      where: { email },
      update: { passwordHash, globalRole: GlobalRole.SUPER_ADMIN, isActive: true },
      create: {
        email,
        passwordHash,
        displayName: dto.displayName?.trim() || 'Administrateur',
        globalRole: GlobalRole.SUPER_ADMIN,
        isActive: true,
      },
      select: { id: true, email: true, displayName: true, globalRole: true },
    });

    // Trace volontairement explicite : cette opération donne les pleins droits.
    this.logger.warn(
      `AMORÇAGE : compte SUPER_ADMIN ${existed ? 'mis à jour' : 'créé'} pour ${email}. ` +
        'Retirer ADMIN_BOOTSTRAP_SECRET des variables d’environnement.',
    );

    // Rattachement à une organisation : le back-office suffit avec le rôle
    // global, mais le dashboard manager travaille toujours dans une organisation.
    let organization: { id: string; name: string } | null = null;
    if (dto.organizationId) {
      const org = await this.prisma.organization.findUnique({
        where: { id: dto.organizationId },
        select: { id: true, name: true },
      });
      if (!org) throw new NotFoundException('Organisation introuvable');

      await this.prisma.organizationMember.upsert({
        where: {
          userId_organizationId: { userId: user.id, organizationId: org.id },
        },
        update: { orgRole: OrgRole.ORG_ADMIN },
        create: { userId: user.id, organizationId: org.id, orgRole: OrgRole.ORG_ADMIN },
      });
      organization = org;
    }

    const memberships = await this.prisma.organizationMember.count({
      where: { userId: user.id },
    });

    return {
      created: !existed,
      user,
      organization,
      /** Organisations disponibles, pour un second appel avec organizationId. */
      availableOrganizations:
        memberships === 0
          ? await this.prisma.organization.findMany({
              select: { id: true, name: true },
              orderBy: { name: 'asc' },
              take: 20,
            })
          : [],
      warning:
        memberships === 0
          ? 'Ce compte n’appartient à aucune organisation : le back-office fonctionnera, mais le dashboard manager a besoin d’une organisation. Relancer en fournissant organizationId.'
          : null,
      nextStep:
        'Retire maintenant ADMIN_BOOTSTRAP_SECRET des variables d’environnement pour refermer cette porte.',
    };
  }
}
