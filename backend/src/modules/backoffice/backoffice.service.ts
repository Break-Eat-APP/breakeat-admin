import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PaymentStatus, OrgStatus, GlobalRole } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ExpoPushService } from '../notifications/expo-push.service';
import { PushTokensService } from '../notifications/push-tokens.service';
import { ScheduledPushService } from '../notifications/scheduled-push.service';
import { tauxMoyenBps, type TrancheTva } from '../../common/helpers/tva';
import { ventilationCommandes } from '../../common/helpers/ventilation-commandes';
import { adresseTemoin, libererSlugInactif } from '../../common/helpers/liberation-archives';
import type { CreateBackofficeOrgDto } from './dto/create-backoffice-org.dto';
import type { UpdateBackofficeOrgDto } from './dto/update-backoffice-org.dto';
import type { SendNotificationDto } from './dto/send-notification.dto';
import type { ScheduleNotificationDto } from './dto/schedule-notification.dto';

/**
 * Cross-tenant KPI snapshot for the back-office overview.
 * All monetary values are integer cents. Le HT se deduit du taux de TVA fige
 * sur chaque ligne de commande -- 5,5 / 10 / 20 % selon le produit -- et non
 * d'un taux unique. Meme calcul que StatsService : les deux ecrans doivent
 * tomber sur le meme chiffre pour le meme perimetre.
 */
export interface GlobalKpis {
  revenue: {
    caTtcCents: number;
    caHtCents: number;
    /** Taux MOYEN collecte (0.13 = 13 %), pour affichage. Voir vatBreakdown. */
    vatRate: number;
    /** Le detail par taux, du plus bas au plus eleve. */
    vatBreakdown: TrancheTva[];
  };
  ordersCount: number;
  averageBasket: {
    htCents: number;
    ttcCents: number;
  };
  /** Total customer + admin accounts on the platform. */
  accountsCount: number;
  organizationsCount: number;
}

/**
 * BackofficeService — cross-tenant supervision logic for SUPER_ADMIN only.
 *
 * Unlike OrganizationsService (org-scoped, membership-gated), every method here
 * is platform-wide. Access control is enforced upstream by RolesGuard +
 * @Roles(SUPER_ADMIN) on the controller, so the service assumes the caller is
 * already authorised and does not re-check membership.
 *
 * Revenue rule: an order counts toward CA only when paymentStatus = SUCCEEDED.
 * Order.totalCents is tax-inclusive (TTC); le HT se deduit du taux fige sur
 * chaque ligne -- voir `common/helpers/tva.ts`.
 */
@Injectable()
export class BackofficeService {
  private readonly logger = new Logger(BackofficeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expoPush: ExpoPushService,
    private readonly pushTokens: PushTokensService,
    private readonly scheduledPush: ScheduledPushService,
  ) {}

  // ─── KPIs ─────────────────────────────────────────────────────

  /**
   * Aggregates platform-wide KPIs over PAID orders (paymentStatus = SUCCEEDED).
   * Returns CA HT/TTC, order count, average basket HT/TTC, account & org counts.
   */
  async getGlobalKpis(): Promise<GlobalKpis> {
    const [agg, accountsCount, organizationsCount] = await Promise.all([
      this.prisma.order.aggregate({
        where: { paymentStatus: PaymentStatus.SUCCEEDED },
        _sum: { totalCents: true },
        _count: { _all: true },
      }),
      this.prisma.user.count(),
      this.prisma.organization.count(),
    ]);

    const caTtcCents = agg._sum.totalCents ?? 0;
    const ordersCount = agg._count._all;
    const ventilation = await ventilationCommandes(
      this.prisma,
      { paymentStatus: PaymentStatus.SUCCEEDED },
      caTtcCents,
    );
    const caHtCents = ventilation.htCents;

    const avgBasketTtcCents = ordersCount > 0 ? Math.round(caTtcCents / ordersCount) : 0;
    const avgBasketHtCents = ordersCount > 0 ? Math.round(caHtCents / ordersCount) : 0;

    return {
      revenue: {
        caTtcCents,
        caHtCents,
        vatRate: tauxMoyenBps(ventilation) / 10_000,
        vatBreakdown: ventilation.tranches,
      },
      ordersCount,
      averageBasket: { htCents: avgBasketHtCents, ttcCents: avgBasketTtcCents },
      accountsCount,
      organizationsCount,
    };
  }

  // ─── Organisations (cross-tenant CRUD) ────────────────────────

  /** Lists every organisation with member / event / supplier / group counts. */
  async listOrganizations() {
    return this.prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        logoUrl: true,
        primaryColor: true,
        createdAt: true,
        _count: {
          select: { members: true, events: true, suppliers: true, groups: true },
        },
      },
    });
  }

  /** Returns a single organisation with members + counts. 404 if unknown. */
  async getOrganization(id: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: { select: { id: true, email: true, displayName: true, globalRole: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        _count: {
          select: { members: true, events: true, suppliers: true, groups: true },
        },
      },
    });
    if (!org) throw new NotFoundException('Organization not found');
    return org;
  }

  /**
   * Provisions a new organisation shell (no membership). The SUPER_ADMIN
   * invites the real ORG_ADMIN afterwards. Slug must be globally unique.
   */
  async createOrganization(dto: CreateBackofficeOrgDto) {
    // Une organisation suspendue ou archivée rend son slug ; une active le
    // garde, et le refus le dit en clair.
    await libererSlugInactif(this.prisma, dto.slug);

    const org = await this.prisma.organization.create({
      data: { name: dto.name, slug: dto.slug },
    });

    this.logger.log(`[backoffice] Organization created: ${org.id} (${org.slug})`);
    return org;
  }

  /**
   * Updates an organisation's profile and/or branding.
   * Only provided fields are written. A new slug must stay globally unique.
   */
  async updateOrganization(id: string, dto: UpdateBackofficeOrgDto) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');

    if (dto.slug && dto.slug !== org.slug) {
      await libererSlugInactif(this.prisma, dto.slug);
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.slug !== undefined && { slug: dto.slug }),
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });

    this.logger.log(`[backoffice] Organization updated: ${id}`);
    return updated;
  }

  /**
   * Activates (ACTIVE) or deactivates (SUSPENDED) an organisation.
   * Deactivation is a soft lock — data is preserved, but the org is suspended.
   */
  async setOrganizationStatus(id: string, active: boolean) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');

    const status = active ? OrgStatus.ACTIVE : OrgStatus.SUSPENDED;

    // Une organisation réactivée reprend son slug d'origine s'il est resté
    // libre. S'il a été repris par un club créé entre-temps, elle garde son
    // slug-témoin : la réactiver reste possible, et le slug se renomme ensuite.
    // Bloquer la réactivation pour un identifiant interne serait disproportionné.
    let slugRepris: { slug: string; archivedSlug: null } | undefined;
    if (active && org.archivedSlug) {
      const occupe = await this.prisma.organization.findUnique({
        where: { slug: org.archivedSlug },
        select: { id: true },
      });
      if (!occupe) slugRepris = { slug: org.archivedSlug, archivedSlug: null };
    }

    const updated = await this.prisma.organization.update({
      where: { id },
      data: { status, ...slugRepris },
    });

    this.logger.log(`[backoffice] Organization ${id} status → ${status}`);
    return updated;
  }

  // ─── Utilisateurs (cross-tenant read) ────────────────────────

  /** Liste tous les comptes inscrits avec leurs appartenances d'org. */
  async listUsers() {
    const comptes = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        archivedEmail: true,
        displayName: true,
        globalRole: true,
        isActive: true,
        createdAt: true,
        memberships: {
          select: {
            orgRole: true,
            organization: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });

    // Un compte libéré porte une adresse-témoin, illisible dans une liste :
    // on affiche l'adresse d'origine, et on signale qu'elle a été rendue — elle
    // apparaît alors aussi sur le compte neuf qui l'a reprise.
    return comptes.map(({ archivedEmail, ...c }) => ({
      ...c,
      email: archivedEmail ?? c.email,
      adresseLiberee: archivedEmail !== null,
    }));
  }

  /**
   * Archive ou réactive un compte.
   *
   * Archiver plutôt que supprimer : les commandes passées restent rattachées au
   * compte, donc le chiffre d'affaires reste juste. L'effet est immédiat — la
   * stratégie JWT relit `isActive` en base à chaque requête, un jeton déjà émis
   * cesse donc de fonctionner.
   *
   * Deux verrous, parce qu'un archivage mal placé ferme la plateforme sans retour
   * possible (les mots de passe sont hachés, il n'existe pas de « mot de passe
   * oublié » pour le back-office) :
   *  - on ne s'archive pas soi-même ;
   *  - on n'archive pas le dernier SUPER_ADMIN actif.
   */
  async setUserActive(id: string, active: boolean, callerId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, archivedEmail: true, globalRole: true, isActive: true },
    });
    if (!user) throw new NotFoundException('Compte introuvable');

    // Réactiver un compte dont l'adresse a été libérée : il la reprend si
    // personne ne s'en est servi depuis. Sinon, la personne s'est réinscrite —
    // son compte actuel est le neuf, et deux comptes ne peuvent pas partager
    // une adresse.
    let adresseReprise: { email: string; archivedEmail: null } | undefined;
    if (active && user.archivedEmail && user.email === adresseTemoin(user.id)) {
      const occupe = await this.prisma.user.findUnique({
        where: { email: user.archivedEmail },
        select: { id: true },
      });
      if (occupe) {
        throw new ConflictException(
          `L'adresse ${user.archivedEmail} a servi à une nouvelle inscription après l'archivage : ` +
            'le compte actuel de cette personne est le nouveau. Réactiver l’ancien créerait deux comptes pour une même adresse.',
        );
      }
      adresseReprise = { email: user.archivedEmail, archivedEmail: null };
    }

    if (!active) {
      if (user.id === callerId) {
        throw new BadRequestException(
          'Vous ne pouvez pas archiver votre propre compte : vous perdriez l’accès au back-office.',
        );
      }
      if (user.globalRole === GlobalRole.SUPER_ADMIN) {
        const autresAdmins = await this.prisma.user.count({
          where: {
            globalRole: GlobalRole.SUPER_ADMIN,
            isActive: true,
            id: { not: user.id },
          },
        });
        if (autresAdmins === 0) {
          throw new BadRequestException(
            'C’est le dernier administrateur plateforme actif : l’archiver rendrait le back-office inaccessible.',
          );
        }
      }
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive: active, ...adresseReprise },
      select: { id: true, email: true, displayName: true, globalRole: true, isActive: true },
    });

    // Trace explicite : couper un accès doit rester visible dans les journaux.
    this.logger.warn(
      `[backoffice] Compte ${updated.email} ${active ? 'réactivé' : 'archivé'} par ${callerId}`,
    );
    return updated;
  }

  // ─── Groups (cross-tenant CRUD) ───────────────────────────────

  /**
   * Lists every group across all organisations, with their owning org and
   * member / event counts.
   */
  async listGroups() {
    return this.prisma.group.findMany({
      orderBy: [{ organization: { name: 'asc' } }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        description: true,
        emailDomain: true,
        createdAt: true,
        organization: { select: { id: true, name: true, slug: true } },
        _count: { select: { members: true, events: true } },
      },
    });
  }

  /** Crée un groupe dans l'organisation indiquée. */
  async createGroup(dto: { orgId: string; name: string; description?: string; emailDomain?: string }) {
    const org = await this.prisma.organization.findUnique({ where: { id: dto.orgId } });
    if (!org) throw new NotFoundException('Organisation introuvable.');

    const existing = await this.prisma.group.findFirst({
      where: { organizationId: dto.orgId, name: dto.name.trim() },
    });
    if (existing) throw new ConflictException(`Un groupe "${dto.name}" existe déjà dans cette organisation.`);

    const group = await this.prisma.group.create({
      data: {
        organizationId: dto.orgId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        emailDomain: dto.emailDomain?.trim().toLowerCase().replace(/^@/, '') || null,
      },
      include: { organization: { select: { id: true, name: true, slug: true } }, _count: { select: { members: true, events: true } } },
    });
    this.logger.log(`[backoffice] Group created: ${group.id} in org ${dto.orgId}`);
    return group;
  }

  /** Supprime définitivement un groupe (cascade sur groupMembers + eventGroups). */
  async deleteGroup(id: string) {
    const group = await this.prisma.group.findUnique({ where: { id } });
    if (!group) throw new NotFoundException('Groupe introuvable.');
    await this.prisma.group.delete({ where: { id } });
    this.logger.log(`[backoffice] Group deleted: ${id}`);
    return { deleted: true };
  }

  // ─── Notifications push (SUPER_ADMIN broadcast) ───────────────

  /**
   * Envoie une notification push immédiate à tous les utilisateurs de la
   * plateforme, ou uniquement aux membres d'une organisation si orgId est fourni.
   * Purge automatiquement les jetons rejetés par Expo (DeviceNotRegistered).
   */
  async sendNotification(dto: SendNotificationDto) {
    let userIds: string[];

    if (dto.orgId) {
      const members = await this.prisma.organizationMember.findMany({
        where: { organizationId: dto.orgId },
        select: { userId: true },
      });
      userIds = members.map((m) => m.userId);
    } else {
      const users = await this.prisma.user.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      userIds = users.map((u) => u.id);
    }

    const tokens = await this.pushTokens.tokensForUsers(userIds);

    if (tokens.length === 0) {
      this.logger.log('[backoffice] sendNotification: aucun jeton enregistré pour la cible');
      return { sent: 0, failed: 0, recipients: 0 };
    }

    const messages = tokens.map((token) => ({
      to: token,
      title: dto.title,
      body: dto.body ?? '',
      sound: 'default' as const,
    }));

    const result = await this.expoPush.send(messages);

    if (result.invalidTokens.length > 0) {
      await this.pushTokens.purgeInvalid(result.invalidTokens);
    }

    this.logger.log(
      `[backoffice] Push envoyé — cible: ${dto.orgId ?? 'tous'}, tokens: ${tokens.length}, sent: ${result.sent}, failed: ${result.failed}`,
    );

    return { sent: result.sent, failed: result.failed, recipients: tokens.length };
  }

  // ─── Suppression organisation ─────────────────────────────────

  /** Supprime définitivement une organisation (cascade Prisma sur venues, events…). */
  async deleteOrganization(id: string) {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException('Organization not found');
    await this.prisma.organization.delete({ where: { id } });
    this.logger.log(`[backoffice] Organization deleted: ${id}`);
    return { deleted: true };
  }

  // ─── Notifications programmées (SUPER_ADMIN cross-tenant) ─────

  /** Crée un push programmé. orgId absent = broadcast plateforme. */
  async scheduleNotification(dto: ScheduleNotificationDto) {
    const when = new Date(dto.scheduledAt);
    if (isNaN(when.getTime())) throw new BadRequestException('Date invalide.');
    if (when <= new Date()) throw new BadRequestException('La date doit être dans le futur.');
    if (dto.orgId) {
      const org = await this.prisma.organization.findUnique({ where: { id: dto.orgId } });
      if (!org) throw new NotFoundException('Organisation introuvable.');
    }
    const push = await this.prisma.scheduledPush.create({
      data: {
        ...(dto.orgId ? { organization: { connect: { id: dto.orgId } } } : {}),
        kind: 'PUSH',
        title: dto.title.trim(),
        body: dto.body?.trim() ?? '',
        scheduledAt: when,
      },
      include: { organization: { select: { id: true, name: true } } },
    });
    this.logger.log(`[backoffice] Notification programmée: ${push.id} à ${when.toISOString()}`);
    return push;
  }

  /** Liste tous les pushs programmés (toutes orgs confondues). */
  async listScheduledNotifications() {
    return this.prisma.scheduledPush.findMany({
      orderBy: { scheduledAt: 'asc' },
      include: { organization: { select: { id: true, name: true } } },
    });
  }

  /** Annule un push PENDING. */
  async cancelScheduledNotification(id: string) {
    const push = await this.prisma.scheduledPush.findUnique({ where: { id } });
    if (!push) throw new NotFoundException('Notification introuvable.');
    if (push.status !== 'PENDING') throw new BadRequestException('Seules les notifications en attente peuvent être annulées.');
    return this.prisma.scheduledPush.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  // ─── Private helpers ──────────────────────────────────────────

  /**
   * Supprime DÉFINITIVEMENT un compte de la base.
   *
   * Pendant de `setUserActive` : archiver coupe l'accès en gardant tout,
   * supprimer efface. Les deux doivent exister — sans suppression, un compte
   * créé par erreur ou un test encombre la liste pour toujours.
   *
   * Trois refus, dans cet ordre :
   *  - soi-même : on se fermerait la porte du back-office ;
   *  - le dernier SUPER_ADMIN actif : plus personne ne pourrait entrer ;
   *  - un compte qui porte des COMMANDES.
   *
   * Ce dernier point n'est pas une précaution de confort : `Order.user` n'a pas
   * de cascade, la base REFUSERAIT l'écriture. Mieux vaut une phrase claire
   * qu'une erreur de contrainte illisible — et surtout, effacer un client
   * effacerait son chiffre d'affaires de la comptabilité. L'archivage est la
   * bonne réponse dans ce cas.
   *
   * Le reste (paniers, jetons, fidélité, appartenances, groupes) cascade.
   */
  async deleteUser(id: string, callerId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, globalRole: true },
    });
    if (!user) throw new NotFoundException('Compte introuvable');

    if (user.id === callerId) {
      throw new BadRequestException(
        'Vous ne pouvez pas supprimer votre propre compte : vous perdriez l’accès au back-office.',
      );
    }

    if (user.globalRole === GlobalRole.SUPER_ADMIN) {
      const autresAdmins = await this.prisma.user.count({
        where: { globalRole: GlobalRole.SUPER_ADMIN, isActive: true, id: { not: user.id } },
      });
      if (autresAdmins === 0) {
        throw new BadRequestException(
          'C’est le dernier administrateur plateforme actif : le supprimer rendrait le back-office inaccessible.',
        );
      }
    }

    const commandes = await this.prisma.order.count({ where: { userId: id } });
    if (commandes > 0) {
      throw new BadRequestException(
        `${user.email} porte ${commandes} commande${commandes > 1 ? 's' : ''} : ` +
          'le supprimer effacerait ce chiffre d’affaires de la comptabilité. ' +
          'Archivez le compte — l’accès est coupé, les données restent.',
      );
    }

    await this.prisma.user.delete({ where: { id } });

    this.logger.warn(`[backoffice] Compte ${user.email} SUPPRIMÉ définitivement par ${callerId}`);
    return { deleted: true, email: user.email };
  }

  /**
   * Remet à zéro les données d'EXPLOITATION d'une organisation.
   *
   * Efface : commandes (avec paiements, lignes, journal, mouvements de
   * fidélité, Live Activity), paniers, événements, buvettes (avec catégories,
   * produits, stocks), points de retrait, comptes de fidélité, notifications
   * programmées.
   *
   * CONSERVE, volontairement :
   *  - l'organisation et son identité visuelle ;
   *  - le LIEU, avec ses coordonnées GPS et ses mots-clés — les ressaisir coûte
   *    du temps, et c'est ce qui rend un lieu découvrable ;
   *  - les ACCÈS (membres), sans quoi plus personne ne pourrait se reconnecter
   *    pour reconfigurer ;
   *  - les groupes, qui portent des invitations extérieures.
   *
   * Le nom doit être recopié à l'identique — voir `ResetOrgDataDto`.
   *
   * Tout se joue dans UNE transaction : un échec à mi-parcours laisserait une
   * organisation à moitié vidée, état pire que celui de départ et bien plus
   * difficile à diagnostiquer.
   */
  // ─── Données de démonstration ────────────────────────────────

  /**
   * Les commandes de l'ancien passage en caisse de démonstration.
   *
   * Jusqu'au 31/08/2026, `demo-checkout` créait de VRAIES commandes, marquées
   * payées (`PAID`, paiement `SUCCEEDED`) sans qu'aucun centime ne bouge. Elles
   * ont un numéro `DEMO-…` et faussent tout ce qui les compte : chiffre
   * d'affaires et TVA de la comptabilité, « Mes commandes » des comptes de
   * test, postes opérateurs où elles attendent encore, créneaux qu'elles
   * occupent — et elles empêchent de supprimer un compte de test.
   */
  private static readonly PREFIXE_DEMO = 'DEMO-';
  static readonly PHRASE_PURGE_DEMO = 'PURGER LA DEMO';

  /** Ce qu'une purge effacerait — à montrer AVANT de la proposer. */
  async apercuDemo() {
    const commandes = await this.prisma.order.findMany({
      where: { publicOrderNumber: { startsWith: BackofficeService.PREFIXE_DEMO } },
      select: { organizationId: true, userId: true, totalCents: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const orgIds = [...new Set(commandes.map((c) => c.organizationId))];
    const orgs = await this.prisma.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true },
    });
    const nomDe = new Map(orgs.map((o) => [o.id, o.name]));

    const parOrganisation = orgIds.map((id) => {
      const lot = commandes.filter((c) => c.organizationId === id);
      return {
        organizationId: id,
        // Une organisation supprimée depuis laisse des commandes orphelines.
        nom: nomDe.get(id) ?? '(organisation supprimée)',
        commandes: lot.length,
        montantCents: lot.reduce((t, c) => t + c.totalCents, 0),
      };
    });

    return {
      commandes: commandes.length,
      montantCents: commandes.reduce((t, c) => t + c.totalCents, 0),
      comptes: new Set(commandes.map((c) => c.userId)).size,
      plusAncienne: commandes[0]?.createdAt ?? null,
      plusRecente: commandes[commandes.length - 1]?.createdAt ?? null,
      parOrganisation,
      phraseConfirmation: BackofficeService.PHRASE_PURGE_DEMO,
    };
  }

  /**
   * Efface les commandes de démonstration, et tout ce qu'elles ont modifié.
   *
   * Supprimer la ligne ne suffit pas : trois traces lui survivraient.
   *  - les PAIEMENTS : leur lien est `SET NULL`, ils resteraient comptés sans
   *    commande ;
   *  - les MOUVEMENTS DE POINTS : sans clé étrangère, ils resteraient, et le
   *    solde du client aurait été débité ou crédité pour rien — on le rétablit ;
   *  - la CHARGE DES CRÉNEAUX : chaque commande y occupait une place.
   * Lignes, historique et Live Activity partent en cascade avec la commande.
   *
   * Une seule transaction : une purge à moitié faite laisserait des soldes
   * corrigés pour des commandes toujours présentes.
   */
  async purgerDemo(confirmation: string) {
    if (confirmation.trim() !== BackofficeService.PHRASE_PURGE_DEMO) {
      throw new BadRequestException(
        `Confirmation incorrecte. Recopiez exactement : « ${BackofficeService.PHRASE_PURGE_DEMO} ».`,
      );
    }

    const bilan = await this.prisma.$transaction(async (tx) => {
      const demo = await tx.order.findMany({
        where: { publicOrderNumber: { startsWith: BackofficeService.PREFIXE_DEMO } },
        select: { id: true, slotId: true },
      });
      const ids = demo.map((c) => c.id);
      if (ids.length === 0) {
        return { commandes: 0, paiements: 0, mouvementsPoints: 0, soldesCorriges: 0, creneaux: 0 };
      }

      // Les points : on annule l'effet de chaque mouvement sur le solde. Un
      // mouvement porte son signe (gain positif, dépense négative) ; l'annuler
      // revient à le soustraire. Le solde ne descend jamais sous zéro — des
      // points gagnés en démo ont pu être dépensés depuis sur une vraie commande.
      const mouvements = await tx.loyaltyTransaction.findMany({
        where: { orderId: { in: ids } },
        select: { accountId: true, points: true },
      });
      const parCompte = new Map<string, number>();
      for (const m of mouvements) {
        parCompte.set(m.accountId, (parCompte.get(m.accountId) ?? 0) + m.points);
      }
      for (const [accountId, effet] of parCompte) {
        const compte = await tx.loyaltyAccount.findUnique({
          where: { id: accountId },
          select: { balance: true },
        });
        if (!compte) continue;
        await tx.loyaltyAccount.update({
          where: { id: accountId },
          data: { balance: Math.max(0, compte.balance - effet) },
        });
      }
      await tx.loyaltyTransaction.deleteMany({ where: { orderId: { in: ids } } });

      // Les créneaux : une place rendue par commande, sans passer sous zéro.
      const parCreneau = new Map<string, number>();
      for (const c of demo) {
        if (c.slotId) parCreneau.set(c.slotId, (parCreneau.get(c.slotId) ?? 0) + 1);
      }
      for (const [slotId, places] of parCreneau) {
        const creneau = await tx.slot.findUnique({
          where: { id: slotId },
          select: { currentLoad: true },
        });
        if (!creneau) continue;
        await tx.slot.update({
          where: { id: slotId },
          data: { currentLoad: Math.max(0, creneau.currentLoad - places) },
        });
      }

      const paiements = (await tx.payment.deleteMany({ where: { orderId: { in: ids } } })).count;
      const commandes = (await tx.order.deleteMany({ where: { id: { in: ids } } })).count;

      return {
        commandes,
        paiements,
        mouvementsPoints: mouvements.length,
        soldesCorriges: parCompte.size,
        creneaux: parCreneau.size,
      };
    });

    this.logger.warn(
      `[backoffice] Purge démo : ${bilan.commandes} commande(s), ${bilan.paiements} paiement(s), ` +
        `${bilan.mouvementsPoints} mouvement(s) de points sur ${bilan.soldesCorriges} solde(s), ` +
        `${bilan.creneaux} créneau(x) libéré(s).`,
    );
    return bilan;
  }

  async resetOrgData(organizationId: string, confirmation: string) {
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { id: true, name: true },
    });
    if (!org) throw new NotFoundException('Organisation introuvable');

    if (confirmation.trim() !== org.name) {
      throw new BadRequestException(
        `Confirmation incorrecte. Recopiez exactement le nom de l'organisation : « ${org.name} ».`,
      );
    }

    const supprime = await this.prisma.$transaction(async (tx) => {
      // Ordre imposé par les clés étrangères : ce qui pointe vers autre chose
      // part en premier. Les cascades déclarées au schéma couvrent le reste
      // (lignes, paiements, journal, catégories, produits, stocks, créneaux).
      const commandes = (await tx.order.deleteMany({ where: { organizationId } })).count;
      // Les paniers ne portent pas d'organisation : ils cascadent depuis
      // l'événement et la buvette, tous deux effacés plus bas. Les viser
      // directement échouerait à la compilation — et serait redondant.
      const fidelite = (await tx.loyaltyAccount.deleteMany({ where: { organizationId } })).count;
      const notifications = (await tx.scheduledPush.deleteMany({ where: { organizationId } }))
        .count;
      const comptoirs = (await tx.pickupPoint.deleteMany({ where: { organizationId } })).count;
      const evenements = (await tx.event.deleteMany({ where: { organizationId } })).count;
      const buvettes = (await tx.supplier.deleteMany({ where: { organizationId } })).count;

      return { commandes, fidelite, notifications, comptoirs, evenements, buvettes };
    });

    this.logger.warn(
      `Remise à zéro de « ${org.name} » (${organizationId}) : ` +
        `${supprime.evenements} événement(s), ${supprime.buvettes} buvette(s), ` +
        `${supprime.comptoirs} comptoir(s), ${supprime.commandes} commande(s).`,
    );

    return { organization: org.name, supprime };
  }

}
