import {
  BadRequestException,
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../../database/prisma.service';
import { GlobalRole, OrgRole } from '../../common/enums/role.enum';
import type { CreateOrganizationDto } from './dto/create-organization.dto';
import type { UpdateOrgBrandingDto } from './dto/update-org-branding.dto';
import type { Organization, OrganizationMember } from '@prisma/client';
import { StripeAccountStatus } from '@prisma/client';
import { StripeService } from '../payments/stripe.service';
import {
  ALL_ORG_ROLES,
  MANAGE_ROLES,
  requireOrgAccess,
} from '../../common/helpers/require-org-access';

export type OrganizationWithMembers = Organization & {
  members: OrganizationMember[];
};

/** Member row enriched with user info + optional supplier info. */
export type MemberWithDetails = OrganizationMember & {
  user: { id: string; email: string; displayName: string; globalRole: string };
  supplier: { id: string; name: string; status: string } | null;
};

/**
 * Retour d'une invitation. `accountCreated` distingue le compte créé à la volée
 * (le mot de passe provisoire est actif, il faut le transmettre) du compte qui
 * existait déjà (le mot de passe fourni a été ignoré — l'annoncer serait faux).
 */
export type InviteResult = MemberWithDetails & { accountCreated: boolean };

/**
 * Rôles qu'un responsable de club (ORG_ADMIN) peut distribuer lui-même.
 *
 * Il équipe son équipe de terrain — les opérateurs du dashboard commandes —
 * mais ne peut pas fabriquer d'autres responsables : donner les clés d'un club
 * reste une décision de la plateforme (SUPER_ADMIN). Sans cette borne, un accès
 * responsable se dupliquerait sans qu'on en garde la trace.
 */
const ROLES_DELEGABLES_PAR_ORG_ADMIN: readonly OrgRole[] = [OrgRole.OPERATOR];

/**
 * OrganizationsService owns all organisation persistence logic.
 *
 * Rules:
 * - When a user creates an org, they automatically become ORG_ADMIN
 * - Only ORG_ADMIN (or SUPER_ADMIN) can add/invite/remove members
 * - Slug must be globally unique
 * - OPERATOR members can be pinned to a specific supplier via supplierId
 */
@Injectable()
export class OrganizationsService {
  private readonly logger = new Logger(OrganizationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly stripe: StripeService,
  ) {}

  // ─── Encaissement (Stripe Connect, au niveau du CLUB) ────────

  /**
   * Ouvre (ou reprend) l'inscription Stripe DU CLUB.
   *
   * Une seule inscription pour toutes ses buvettes : lui en demander une par
   * comptoir reviendrait à lui faire saisir quatre fois les mêmes coordonnées
   * bancaires, pour une recette éparpillée sur quatre tableaux de bord.
   *
   * Le lien est à usage unique et de courte durée : on en redemande un à chaque
   * appel plutôt que de le conserver.
   */
  async createOnboardingLink(organizationId: string, userId: string) {
    await requireOrgAccess(this.prisma, userId, organizationId, MANAGE_ROLES);

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true, stripeAccountId: true },
    });
    if (!org) throw new NotFoundException('Organisation introuvable');

    let accountId = org.stripeAccountId;
    if (!accountId) {
      const email = await this.emailAppelant(userId);
      const account = await this.stripe.createConnectAccount({
        email,
        country: 'FR',
        businessName: org.name,
        metadata: { organizationId },
      });
      accountId = account.id;
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { stripeAccountId: accountId, stripeAccountStatus: StripeAccountStatus.PENDING },
      });
      this.logger.log(`Compte Stripe cree pour le club ${organizationId} : ${accountId}`);
    }

    const link = await this.stripe.createOnboardingLink(accountId);
    return { accountId, url: link.url, expiresAt: link.expires_at };
  }

  /** Relit l'etat chez Stripe et le recopie : c'est lui qui fait foi. */
  async refreshStripeStatus(organizationId: string, userId: string) {
    await requireOrgAccess(this.prisma, userId, organizationId, ALL_ORG_ROLES);

    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { stripeAccountId: true },
    });
    if (!org?.stripeAccountId) {
      throw new BadRequestException(
        'Ce club n’a pas encore de compte Stripe — commencez par « Se connecter à Stripe ».',
      );
    }

    const account = await this.stripe.retrieveAccount(org.stripeAccountId);
    const actif = account.charges_enabled === true;
    const statut = actif
      ? StripeAccountStatus.ACTIVE
      : account.details_submitted
        ? StripeAccountStatus.RESTRICTED
        : StripeAccountStatus.PENDING;

    return this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        stripeAccountStatus: statut,
        stripeChargesEnabled: actif,
        ...(actif ? { stripeOnboardedAt: new Date() } : {}),
      },
      select: {
        id: true,
        stripeAccountId: true,
        stripeAccountStatus: true,
        stripeChargesEnabled: true,
      },
    });
  }

  private async emailAppelant(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new NotFoundException('Utilisateur introuvable');
    return user.email;
  }

  /**
   * Creates a new organisation and adds the creator as ORG_ADMIN.
   * Runs in a transaction to ensure atomicity.
   */
  async create(
    creatorId: string,
    dto: CreateOrganizationDto,
  ): Promise<OrganizationWithMembers> {
    const existing = await this.prisma.organization.findUnique({
      where: { slug: dto.slug },
    });

    if (existing) {
      throw new ConflictException(`Slug "${dto.slug}" is already taken`);
    }

    const organization = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: dto.name,
          slug: dto.slug,
          settings: (dto.settings ?? {}) as object,
        },
      });

      await tx.organizationMember.create({
        data: {
          userId: creatorId,
          organizationId: org.id,
          orgRole: OrgRole.ORG_ADMIN,
        },
      });

      return tx.organization.findUniqueOrThrow({
        where: { id: org.id },
        include: { members: true },
      });
    });

    this.logger.log(`Organization created: ${organization.id} (${organization.slug}) by user ${creatorId}`);

    return organization;
  }

  /**
   * Interdit à un responsable de club de distribuer un rôle plus large que
   * l'opérateur. Appelé seulement quand l'appelant n'est pas SUPER_ADMIN.
   */
  //
  // Accepte une chaine plutot que `OrgRole` : le role peut venir d'un DTO
  // (enumeration de l'app) ou d'une ligne Prisma (enumeration generee). Les
  // deux portent les memes valeurs mais restent des types distincts ; forcer
  // un cast masquerait un vrai ecart le jour ou elles divergeraient.
  private assertRoleDelegable(role: string): void {
    if (!(ROLES_DELEGABLES_PAR_ORG_ADMIN as readonly string[]).includes(role)) {
      throw new ForbiddenException(
        'Vous ne pouvez créer que des accès opérateur. Un accès manager ou admin est délivré par Break Eat.',
      );
    }
  }

  /**
   * Returns an organisation by id.
   * Throws NotFoundException if not found.
   * Throws ForbiddenException if requesting user is not a member
   * (SUPER_ADMIN bypasses the membership check and can view any org).
   */
  async findById(
    id: string,
    requestingUserId: string,
    callerGlobalRole: string,
  ): Promise<OrganizationWithMembers> {
    const org = await this.prisma.organization.findUnique({
      where: { id },
      include: { members: true },
    });

    if (!org) throw new NotFoundException('Organization not found');

    // SUPER_ADMIN can view any organisation regardless of membership
    if (callerGlobalRole !== GlobalRole.SUPER_ADMIN) {
      const isMember = org.members.some((m) => m.userId === requestingUserId);
      if (!isMember) {
        throw new ForbiddenException('Access denied to this organization');
      }
    }

    return org;
  }

  /**
   * Returns all members of an organisation with user info + optional supplier info.
   * Any member can view the list; SUPER_ADMIN bypasses membership check.
   */
  async getMembers(
    organizationId: string,
    callerId: string,
    callerGlobalRole: string,
  ): Promise<MemberWithDetails[]> {
    if (callerGlobalRole !== GlobalRole.SUPER_ADMIN) {
      const callerMembership = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: callerId, organizationId } },
      });
      if (!callerMembership) {
        throw new ForbiddenException('Access denied to this organization');
      }
    }

    return this.prisma.organizationMember.findMany({
      where: { organizationId },
      include: {
        user: { select: { id: true, email: true, displayName: true, globalRole: true } },
        supplier: { select: { id: true, name: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Adds a user as a member of an organisation by userId.
   * Only ORG_ADMIN of that org (or SUPER_ADMIN) can call this.
   * Throws ForbiddenException if the caller lacks the required role.
   * Throws NotFoundException if the target user does not exist.
   * Throws ConflictException if the target is already a member.
   */
  async addMember(
    organizationId: string,
    callerId: string,
    callerGlobalRole: string,
    targetUserId: string,
    role: OrgRole,
  ): Promise<OrganizationMember> {
    // SUPER_ADMIN can add members to any org; otherwise caller must be ORG_ADMIN
    if (callerGlobalRole !== GlobalRole.SUPER_ADMIN) {
      const callerMembership = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: callerId, organizationId } },
      });
      if (!callerMembership || callerMembership.orgRole !== OrgRole.ORG_ADMIN) {
        throw new ForbiddenException('Only ORG_ADMIN can add members');
      }
      this.assertRoleDelegable(role);
    }

    // Verify the target user actually exists in the platform
    const targetUser = await this.prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    // Prevent duplicate membership
    const existing = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: targetUserId, organizationId } },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this organization');
    }

    const member = await this.prisma.organizationMember.create({
      data: { userId: targetUserId, organizationId, orgRole: role },
    });

    this.logger.log(
      `Member added: user ${targetUserId} → org ${organizationId} as ${role} (by ${callerId})`,
    );

    return member;
  }

  /**
   * Invites a user by email to join an organisation with a given role.
   * Only ORG_ADMIN (or SUPER_ADMIN) can invite.
   * For OPERATOR role, supplierId pins the operator to a specific supplier.
   * Throws NotFoundException if no user matches the email (they must register first).
   * Throws ConflictException if already a member.
   */
  async inviteByEmail(
    organizationId: string,
    callerId: string,
    callerGlobalRole: string,
    email: string,
    role: OrgRole,
    supplierId?: string,
    /**
     * Mot de passe provisoire : permet d'inviter quelqu'un qui n'a PAS encore
     * de compte (cas courant d'un responsable F&B qu'on intègre). Sans lui, on
     * conserve l'ancien comportement (404 + invitation à créer un compte).
     */
    temporaryPassword?: string,
  ): Promise<InviteResult> {
    // Permission check
    if (callerGlobalRole !== GlobalRole.SUPER_ADMIN) {
      const callerMembership = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: callerId, organizationId } },
      });
      if (!callerMembership || callerMembership.orgRole !== OrgRole.ORG_ADMIN) {
        throw new ForbiddenException('Only ORG_ADMIN can invite members');
      }
      this.assertRoleDelegable(role);
    }

    // Find user by email — ou le créer si un mot de passe provisoire est fourni.
    const normalizedEmail = email.toLowerCase().trim();
    let targetUser = await this.prisma.user.findUnique({ where: { email: normalizedEmail } });
    let accountCreated = false;

    if (!targetUser) {
      if (!temporaryPassword) {
        throw new NotFoundException(
          `Aucun compte trouvé pour "${email}". Fournissez un mot de passe provisoire pour créer le compte, ou demandez-lui de s'inscrire d'abord.`,
        );
      }
      // Compte créé avec le rôle global le plus faible : les droits viennent
      // UNIQUEMENT de l'appartenance à l'organisation, jamais d'un rôle global.
      targetUser = await this.prisma.user.create({
        data: {
          email: normalizedEmail,
          passwordHash: await argon2.hash(temporaryPassword),
          displayName: normalizedEmail.split('@')[0] ?? 'Membre',
          globalRole: GlobalRole.CUSTOMER,
          isActive: true,
        },
      });
      accountCreated = true;
      this.logger.log(`Compte créé à l'invitation : ${normalizedEmail}`);
    }

    // Prevent duplicate membership
    const existing = await this.prisma.organizationMember.findUnique({
      where: { userId_organizationId: { userId: targetUser.id, organizationId } },
    });
    if (existing) {
      throw new ConflictException('Cet utilisateur est déjà membre de cette organisation');
    }

    // Validate supplier exists (if provided)
    if (supplierId) {
      const supplier = await this.prisma.supplier.findUnique({ where: { id: supplierId } });
      if (!supplier || supplier.organizationId !== organizationId) {
        throw new NotFoundException('Supplier not found in this organization');
      }
    }

    const member = await this.prisma.organizationMember.create({
      data: {
        userId: targetUser.id,
        organizationId,
        orgRole: role,
        supplierId: supplierId ?? null,
      },
      include: {
        user: { select: { id: true, email: true, displayName: true, globalRole: true } },
        supplier: { select: { id: true, name: true, status: true } },
      },
    });

    this.logger.log(
      `Member invited: ${targetUser.email} → org ${organizationId} as ${role}${supplierId ? ` (supplier ${supplierId})` : ''} (by ${callerId})`,
    );

    return { ...(member as MemberWithDetails), accountCreated };
  }

  /**
   * Updates the branding fields (logoUrl, primaryColor, description) of an organisation.
   * Only ORG_ADMIN (or SUPER_ADMIN) can update branding.
   */
  async updateBranding(
    organizationId: string,
    callerId: string,
    callerGlobalRole: string,
    dto: UpdateOrgBrandingDto,
  ): Promise<Organization> {
    if (callerGlobalRole !== GlobalRole.SUPER_ADMIN) {
      const callerMembership = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: callerId, organizationId } },
      });
      if (!callerMembership || callerMembership.orgRole !== OrgRole.ORG_ADMIN) {
        throw new ForbiddenException('Only ORG_ADMIN can update organization branding');
      }
    }

    const org = await this.prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new NotFoundException('Organization not found');

    const updated = await this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
        ...(dto.primaryColor !== undefined && { primaryColor: dto.primaryColor }),
        ...(dto.description !== undefined && { description: dto.description }),
      },
    });

    this.logger.log(`Organization branding updated: ${organizationId} (by ${callerId})`);
    return updated;
  }

  /**
   * Removes a member from an organisation.
   * Only ORG_ADMIN (or SUPER_ADMIN) can remove members.
   * Callers cannot remove themselves.
   */
  /**
   * Redefinit le mot de passe d'un membre.
   *
   * Comble un trou du modele : `inviteByEmail` ne pose un mot de passe qu'a la
   * CREATION du compte. Des lors qu'un compte existait deja, son mot de passe
   * n'etait plus modifiable nulle part — et reinviter la personne echouait sur
   * « deja membre ». Un operateur qui oubliait son mot de passe devenait donc
   * definitivement inaccessible.
   *
   * Le nouveau mot de passe est fourni par l'appelant, comme pour l'invitation :
   * c'est ce qui permet a l'interface de l'AFFICHER. Le generer ici obligerait a
   * le renvoyer dans la reponse, donc a le faire transiter par les journaux
   * serveur en cas de debogage.
   *
   * Garde-fous, calques sur `removeMember` :
   *  - SUPER_ADMIN partout ; sinon ORG_ADMIN de CETTE organisation ;
   *  - un ORG_ADMIN ne peut viser qu'un role delegable (operateur) : sans cela
   *    il prendrait la main sur le compte d'un autre manager ;
   *  - jamais sur soi-meme — ce chemin sert a depanner autrui, et se l'appliquer
   *    contournerait un futur flux de changement de mot de passe personnel.
   */
  async resetMemberPassword(
    organizationId: string,
    memberId: string,
    callerId: string,
    callerGlobalRole: string,
    newPassword: string,
  ): Promise<{ email: string }> {
    const member = await this.prisma.organizationMember.findUnique({
      where: { id: memberId },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!member || member.organizationId !== organizationId) {
      throw new NotFoundException('Member not found');
    }

    if (callerGlobalRole !== GlobalRole.SUPER_ADMIN) {
      const callerMembership = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: callerId, organizationId } },
      });
      if (!callerMembership || callerMembership.orgRole !== OrgRole.ORG_ADMIN) {
        throw new ForbiddenException('Only ORG_ADMIN can reset a member password');
      }
      this.assertRoleDelegable(member.orgRole);
    }

    if (member.userId === callerId) {
      throw new ForbiddenException(
        'Vous ne pouvez pas redefinir votre propre mot de passe par ce chemin.',
      );
    }

    await this.prisma.user.update({
      where: { id: member.userId },
      data: { passwordHash: await argon2.hash(newPassword) },
    });

    // Jamais le mot de passe dans les journaux.
    this.logger.log(
      `Mot de passe redefini pour le membre ${memberId} (org ${organizationId}) par ${callerId}`,
    );

    return { email: member.user.email };
  }
  async removeMember(
    organizationId: string,
    memberId: string,
    callerId: string,
    callerGlobalRole: string,
  ): Promise<void> {
    if (callerGlobalRole !== GlobalRole.SUPER_ADMIN) {
      const callerMembership = await this.prisma.organizationMember.findUnique({
        where: { userId_organizationId: { userId: callerId, organizationId } },
      });
      if (!callerMembership || callerMembership.orgRole !== OrgRole.ORG_ADMIN) {
        throw new ForbiddenException('Only ORG_ADMIN can remove members');
      }
    }

    const member = await this.prisma.organizationMember.findUnique({
      where: { id: memberId },
    });

    if (!member || member.organizationId !== organizationId) {
      throw new NotFoundException('Member not found');
    }

    if (member.userId === callerId) {
      throw new ForbiddenException('You cannot remove yourself from the organization');
    }

    await this.prisma.organizationMember.delete({ where: { id: memberId } });

    this.logger.log(`Member removed: ${memberId} from org ${organizationId} (by ${callerId})`);
  }
}
