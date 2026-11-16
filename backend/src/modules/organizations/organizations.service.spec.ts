import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../../database/prisma.service';
import { StripeService } from '../payments/stripe.service';
import { OrgRole } from '../../common/enums/role.enum';

// ─── Helpers ─────────────────────────────────────────────────

const ORG_ID = 'org-1';
const CALLER_ID = 'caller-1';
const TARGET_ID = 'target-1';

function mockOrg(memberUserIds: string[] = [CALLER_ID]) {
  return {
    id: ORG_ID,
    name: 'Test Org',
    slug: 'test-org',
    status: 'ACTIVE',
    settings: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    members: memberUserIds.map((userId) => ({
      userId,
      organizationId: ORG_ID,
      orgRole: OrgRole.ORG_ADMIN,
      createdAt: new Date(),
    })),
  };
}

function mockMembership(orgRole = OrgRole.ORG_ADMIN) {
  return { userId: CALLER_ID, organizationId: ORG_ID, orgRole };
}

// ─── Tests ────────────────────────────────────────────────────

describe('OrganizationsService', () => {
  let service: OrganizationsService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          // Phase 26 — le club porte son compte Stripe. Aucun test de ce fichier
          // n'appelle Stripe : un mock vide suffit a l'injection.
          provide: StripeService,
          useValue: {
            createConnectAccount: jest.fn(),
            createOnboardingLink: jest.fn(),
            retrieveAccount: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            organization: {
              findUnique: jest.fn(),
              create: jest.fn(),
              findUniqueOrThrow: jest.fn(),
            },
            organizationMember: {
              findUnique: jest.fn(),
              create: jest.fn(),
            },
            user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
            supplier: { findUnique: jest.fn() },
            organizationInvitation: {
              upsert: jest.fn(),
              findFirst: jest.fn(),
              findMany: jest.fn(),
              delete: jest.fn(),
              deleteMany: jest.fn(),
            },
            // La vraie transaction passe un client au rappel : on lui donne la
            // même doublure, ce qui suffit à observer les écritures émises.
            $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
          },
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
    prisma = module.get(PrismaService);
  });

  // ─── findById ────────────────────────────────────────────────

  describe('findById', () => {
    it('returns org when caller is a member', async () => {
      const org = mockOrg([CALLER_ID]);
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(org);

      const result = await service.findById(ORG_ID, CALLER_ID, 'CUSTOMER');
      expect(result).toEqual(org);
    });

    it('throws NotFoundException when org does not exist', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.findById(ORG_ID, CALLER_ID, 'CUSTOMER')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when caller is not a member', async () => {
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(mockOrg([]));

      await expect(service.findById(ORG_ID, CALLER_ID, 'CUSTOMER')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('SUPER_ADMIN can view an org they are not a member of', async () => {
      // Org has NO members for CALLER_ID
      (prisma.organization.findUnique as jest.Mock).mockResolvedValue(mockOrg([]));

      const result = await service.findById(ORG_ID, CALLER_ID, 'SUPER_ADMIN');
      expect(result).toBeDefined();
    });
  });

  // ─── addMember ───────────────────────────────────────────────

  describe('addMember', () => {
    // 16/11/2026 : ajouter un compte par son identifiant, c'est le rattacher
    // sans son accord. Un club passe désormais par l'invitation par e-mail.
    it('un club n ajoute plus un compte par son identifiant', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce(
        mockMembership(OrgRole.ORG_ADMIN),
      );

      await expect(
        service.addMember(ORG_ID, CALLER_ID, 'CUSTOMER', TARGET_ID, OrgRole.OPERATOR),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.organizationMember.create).not.toHaveBeenCalled();
    });

    it('interdit à un ORG_ADMIN de fabriquer un autre responsable', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce(
        mockMembership(OrgRole.ORG_ADMIN),
      );

      await expect(
        service.addMember(ORG_ID, CALLER_ID, 'CUSTOMER', TARGET_ID, OrgRole.ORG_ADMIN),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.organizationMember.create).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when caller is not ORG_ADMIN', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce(
        mockMembership(OrgRole.OPERATOR),
      );

      await expect(
        service.addMember(ORG_ID, CALLER_ID, 'CUSTOMER', TARGET_ID, OrgRole.MANAGER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when caller has no membership', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.addMember(ORG_ID, CALLER_ID, 'CUSTOMER', TARGET_ID, OrgRole.MANAGER),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when target user does not exist (plateforme)', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null); // target not found

      await expect(
        service.addMember(ORG_ID, CALLER_ID, 'SUPER_ADMIN', TARGET_ID, OrgRole.OPERATOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when target is already a member (plateforme)', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce({
        userId: TARGET_ID,
      }); // duplicate found
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: TARGET_ID });

      await expect(
        service.addMember(ORG_ID, CALLER_ID, 'SUPER_ADMIN', TARGET_ID, OrgRole.OPERATOR),
      ).rejects.toThrow(ConflictException);
    });

    it('SUPER_ADMIN can add member without being ORG_ADMIN', async () => {
      // organizationMember.findUnique should NOT be called for caller check
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: TARGET_ID });
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce(null); // duplicate check
      const created = { userId: TARGET_ID, organizationId: ORG_ID, orgRole: OrgRole.MANAGER };
      (prisma.organizationMember.create as jest.Mock).mockResolvedValue(created);

      const result = await service.addMember(
        ORG_ID,
        CALLER_ID,
        'SUPER_ADMIN',
        TARGET_ID,
        OrgRole.MANAGER,
      );
      expect(result).toEqual(created);
    });
  });

  // ─── inviteByEmail ───────────────────────────────────────────
  //
  // `accountCreated` pilote l'affichage du mot de passe provisoire dans le
  // dashboard : le trahir ferait annoncer un mot de passe inopérant, ou en
  // cacherait un qui est le seul moyen de se connecter.

  describe('inviteByEmail', () => {
    const EMAIL = 'Responsable.FB@Club.fr';

    function mockInvitedMember(userId: string) {
      return {
        id: 'member-1',
        userId,
        organizationId: ORG_ID,
        orgRole: OrgRole.MANAGER,
        supplierId: null,
        createdAt: new Date(),
        user: { id: userId, email: EMAIL.toLowerCase(), displayName: 'Responsable.FB', globalRole: 'CUSTOMER' },
        supplier: null,
      };
    }

    it('crée le compte absent et signale accountCreated', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({ id: TARGET_ID });
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.organizationMember.create as jest.Mock).mockResolvedValue(mockInvitedMember(TARGET_ID));

      const result = await service.inviteByEmail(
        ORG_ID, CALLER_ID, 'SUPER_ADMIN', EMAIL, OrgRole.MANAGER, undefined, 'motdepasse-provisoire',
      );

      expect(result.accountCreated).toBe(true);
      // L'e-mail est normalisé : sinon deux casses créeraient deux comptes.
      expect((prisma.user.create as jest.Mock).mock.calls[0][0].data.email).toBe(EMAIL.toLowerCase());
      // Le mot de passe n'est jamais stocké en clair.
      expect((prisma.user.create as jest.Mock).mock.calls[0][0].data.passwordHash).not.toContain(
        'motdepasse-provisoire',
      );
    });

    it('n’annonce aucun mot de passe quand le compte existait déjà', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: TARGET_ID, email: EMAIL.toLowerCase() });
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.organizationMember.create as jest.Mock).mockResolvedValue(mockInvitedMember(TARGET_ID));

      const result = await service.inviteByEmail(
        ORG_ID, CALLER_ID, 'SUPER_ADMIN', EMAIL, OrgRole.MANAGER, undefined, 'motdepasse-provisoire',
      );

      expect(result.accountCreated).toBe(false);
      // Le mot de passe existant reste intact.
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('un responsable de club ne peut inviter qu’un opérateur', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce(
        mockMembership(OrgRole.ORG_ADMIN),
      );

      await expect(
        service.inviteByEmail(ORG_ID, CALLER_ID, 'CUSTOMER', EMAIL, OrgRole.ORG_ADMIN, undefined, 'mdp-provisoire'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('la plateforme, elle, peut délivrer un accès responsable', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({ id: TARGET_ID });
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.organizationMember.create as jest.Mock).mockResolvedValue(mockInvitedMember(TARGET_ID));

      const result = await service.inviteByEmail(
        ORG_ID, CALLER_ID, 'SUPER_ADMIN', EMAIL, OrgRole.ORG_ADMIN, undefined, 'mdp-provisoire',
      );

      expect(result.accountCreated).toBe(true);
    });

    it('ne crée AUCUN compte quand la buvette appartient à un autre club', async () => {
      // Le défaut : le compte était créé d'abord, les contrôles ensuite. Un
      // refus ici laissait en base un compte avec un mot de passe provisoire
      // choisi par quelqu'un d'autre, sans appartenance, que rien ne rattachait
      // à personne — et l'invité pouvait s'y connecter.
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.supplier.findUnique as jest.Mock).mockResolvedValue({
        id: 'sup-autre-club',
        organizationId: 'org-2',
      });

      await expect(
        service.inviteByEmail(
          ORG_ID, CALLER_ID, 'SUPER_ADMIN', EMAIL, OrgRole.OPERATOR, 'sup-autre-club', 'mdp-provisoire',
        ),
      ).rejects.toThrow(NotFoundException);

      expect(prisma.user.create).not.toHaveBeenCalled();
      expect(prisma.organizationMember.create).not.toHaveBeenCalled();
    });

    it('ne crée AUCUN compte quand la personne est déjà membre', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: TARGET_ID,
        email: EMAIL.toLowerCase(),
      });
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(
        mockInvitedMember(TARGET_ID),
      );

      await expect(
        service.inviteByEmail(
          ORG_ID, CALLER_ID, 'SUPER_ADMIN', EMAIL, OrgRole.MANAGER, undefined, 'mdp-provisoire',
        ),
      ).rejects.toThrow(ConflictException);

      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('le compte et l’appartenance naissent dans la MÊME transaction', async () => {
      // Séparés, un échec de l'appartenance laissait le compte derrière lui.
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.create as jest.Mock).mockResolvedValue({ id: TARGET_ID });
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.organizationMember.create as jest.Mock).mockResolvedValue(mockInvitedMember(TARGET_ID));

      await service.inviteByEmail(
        ORG_ID, CALLER_ID, 'SUPER_ADMIN', EMAIL, OrgRole.MANAGER, undefined, 'mdp-provisoire',
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect((prisma.user.create as jest.Mock).mock.invocationCallOrder[0]).toBeGreaterThan(
        (prisma.$transaction as jest.Mock).mock.invocationCallOrder[0],
      );
    });

    it('refuse un e-mail inconnu sans mot de passe provisoire', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.inviteByEmail(ORG_ID, CALLER_ID, 'SUPER_ADMIN', EMAIL, OrgRole.MANAGER),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  // --- Invitations à accepter (16/11/2026) ----------------------

  describe('invitation à accepter', () => {
    const EMAIL = 'responsable@autre-club.fr';
    const INVITATION_ID = 'invitation-1';
    const compteExistant = { id: TARGET_ID, email: EMAIL, displayName: 'Responsable' };

    it('un club qui invite un compte EXISTANT crée une invitation, pas un membre', async () => {
      (prisma.organizationMember.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMembership(OrgRole.ORG_ADMIN)) // l'appelant
        .mockResolvedValueOnce(null); // pas encore membre
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(compteExistant);
      (prisma.organizationInvitation.upsert as jest.Mock).mockResolvedValue({ id: INVITATION_ID });

      const result = await service.inviteByEmail(
        ORG_ID, CALLER_ID, 'CUSTOMER', EMAIL, OrgRole.OPERATOR,
      );

      expect(result.enAttente).toBe(true);
      expect(result.accountCreated).toBe(false);
      expect(prisma.organizationMember.create).not.toHaveBeenCalled();
      expect(prisma.user.create).not.toHaveBeenCalled();
      const arg = (prisma.organizationInvitation.upsert as jest.Mock).mock.calls[0][0];
      expect(arg.create.userId).toBe(TARGET_ID);
      expect(arg.create.organizationId).toBe(ORG_ID);
      expect(arg.create.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('la plateforme ajoute toujours directement un compte existant', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(compteExistant);
      (prisma.organizationMember.create as jest.Mock).mockResolvedValue({
        id: 'member-1', user: compteExistant, supplier: null,
      });

      const result = await service.inviteByEmail(
        ORG_ID, CALLER_ID, 'SUPER_ADMIN', EMAIL, OrgRole.MANAGER,
      );

      expect(result.enAttente).toBe(false);
      expect(prisma.organizationInvitation.upsert).not.toHaveBeenCalled();
      expect(prisma.organizationMember.create).toHaveBeenCalledTimes(1);
    });

    it('la personne invitée accepte : elle devient membre, l invitation disparaît', async () => {
      (prisma.organizationInvitation.findFirst as jest.Mock).mockResolvedValue({
        id: INVITATION_ID, userId: TARGET_ID, organizationId: ORG_ID,
        orgRole: OrgRole.OPERATOR, supplierId: 'buvette-1',
        expiresAt: new Date(Date.now() + 60_000),
      });
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.organizationMember.create as jest.Mock).mockResolvedValue({ id: 'member-1' });

      await service.accepterInvitation(TARGET_ID, INVITATION_ID);

      // L'invitation est lue AVEC l'identifiant de la personne : nul n'accepte
      // à la place d'un autre.
      expect((prisma.organizationInvitation.findFirst as jest.Mock).mock.calls[0][0].where).toEqual({
        id: INVITATION_ID, userId: TARGET_ID,
      });
      const cree = (prisma.organizationMember.create as jest.Mock).mock.calls[0][0].data;
      expect(cree).toEqual({
        userId: TARGET_ID, organizationId: ORG_ID, orgRole: OrgRole.OPERATOR, supplierId: 'buvette-1',
      });
      expect(prisma.organizationInvitation.delete).toHaveBeenCalledWith({ where: { id: INVITATION_ID } });
    });

    it('l invitation d un autre compte reste introuvable', async () => {
      (prisma.organizationInvitation.findFirst as jest.Mock).mockResolvedValue(null);

      await expect(service.accepterInvitation('quelqu-un-d-autre', INVITATION_ID)).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.organizationMember.create).not.toHaveBeenCalled();
    });

    it('une invitation expirée ne donne rien, et disparaît', async () => {
      (prisma.organizationInvitation.findFirst as jest.Mock).mockResolvedValue({
        id: INVITATION_ID, userId: TARGET_ID, organizationId: ORG_ID,
        orgRole: OrgRole.OPERATOR, supplierId: null,
        expiresAt: new Date(Date.now() - 1_000),
      });

      await expect(service.accepterInvitation(TARGET_ID, INVITATION_ID)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.organizationMember.create).not.toHaveBeenCalled();
      expect(prisma.organizationInvitation.delete).toHaveBeenCalledTimes(1);
    });

    it('la personne refuse : seule SON invitation disparaît', async () => {
      (prisma.organizationInvitation.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });

      await service.refuserInvitation(TARGET_ID, INVITATION_ID);

      expect(prisma.organizationInvitation.deleteMany).toHaveBeenCalledWith({
        where: { id: INVITATION_ID, userId: TARGET_ID },
      });
      expect(prisma.organizationMember.create).not.toHaveBeenCalled();
    });

    it('un simple membre ne peut pas retirer une invitation du club', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce(
        mockMembership(OrgRole.OPERATOR),
      );

      await expect(
        service.annulerInvitation(ORG_ID, INVITATION_ID, CALLER_ID, 'CUSTOMER'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.organizationInvitation.deleteMany).not.toHaveBeenCalled();
    });

    it('un club ne retire que SES invitations', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce(
        mockMembership(OrgRole.ORG_ADMIN),
      );
      (prisma.organizationInvitation.deleteMany as jest.Mock).mockResolvedValue({ count: 0 });

      await expect(
        service.annulerInvitation(ORG_ID, 'invitation-d-un-autre-club', CALLER_ID, 'CUSTOMER'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.organizationInvitation.deleteMany).toHaveBeenCalledWith({
        where: { id: 'invitation-d-un-autre-club', organizationId: ORG_ID },
      });
    });
  });

  // --- resetMemberPassword -------------------------------------

  describe('resetMemberPassword', () => {
    const MEMBER_ID = 'member-1';

    // Le compte visé : par défaut, un compte d'opérateur créé par CE club
    // (aucune autre vie). Chaque test de refus en change un seul trait.
    const compte = (surcharge: Record<string, unknown> = {}) => ({
      globalRole: 'CUSTOMER',
      cguAcceptedAt: null,
      _count: { memberships: 1, orders: 0, identities: 0 },
      ...surcharge,
    });

    beforeEach(() => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(compte());
    });

    // Membre d'ORG_ID, rattache par defaut a un utilisateur AUTRE que l'appelant.
    const membre = (orgRole: string = OrgRole.OPERATOR, userId = TARGET_ID) => ({
      id: MEMBER_ID,
      organizationId: ORG_ID,
      userId,
      orgRole,
      user: { id: userId, email: 'operateur@club.fr' },
    });

    it('un responsable de club redefinit le mot de passe de son operateur', async () => {
      (prisma.organizationMember.findUnique as jest.Mock)
        .mockResolvedValueOnce(membre())
        .mockResolvedValueOnce({ orgRole: OrgRole.ORG_ADMIN });

      const result = await service.resetMemberPassword(
        ORG_ID, MEMBER_ID, CALLER_ID, 'CUSTOMER', 'nouveau-mot-de-passe',
      );

      expect(result.email).toBe('operateur@club.fr');
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      // Ce qui atteint la base doit etre une empreinte, jamais le mot de passe.
      const arg = (prisma.user.update as jest.Mock).mock.calls[0][0];
      expect(arg.data.passwordHash).not.toBe('nouveau-mot-de-passe');
      expect(String(arg.data.passwordHash).startsWith('$argon2')).toBe(true);
    });

    it('un responsable ne peut PAS viser le compte d un autre responsable', async () => {
      (prisma.organizationMember.findUnique as jest.Mock)
        .mockResolvedValueOnce(membre(OrgRole.ORG_ADMIN))
        .mockResolvedValueOnce({ orgRole: OrgRole.ORG_ADMIN });

      await expect(
        service.resetMemberPassword(ORG_ID, MEMBER_ID, CALLER_ID, 'CUSTOMER', 'peu-importe'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('nul ne redefinit son propre mot de passe par ce chemin', async () => {
      (prisma.organizationMember.findUnique as jest.Mock)
        .mockResolvedValueOnce(membre(OrgRole.OPERATOR, CALLER_ID))
        .mockResolvedValueOnce({ orgRole: OrgRole.ORG_ADMIN });

      await expect(
        service.resetMemberPassword(ORG_ID, MEMBER_ID, CALLER_ID, 'CUSTOMER', 'peu-importe'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('un membre d une AUTRE organisation reste introuvable', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce({
        ...membre(), organizationId: 'org-2',
      });

      await expect(
        service.resetMemberPassword(ORG_ID, MEMBER_ID, CALLER_ID, 'SUPER_ADMIN', 'peu-importe'),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('la plateforme peut redefinir le mot de passe de n importe quel role', async () => {
      (prisma.organizationMember.findUnique as jest.Mock)
        .mockResolvedValueOnce(membre(OrgRole.ORG_ADMIN));

      await service.resetMemberPassword(
        ORG_ID, MEMBER_ID, CALLER_ID, 'SUPER_ADMIN', 'nouveau-mot-de-passe',
      );

      expect(prisma.user.update).toHaveBeenCalledTimes(1);
    });

    describe('un compte qui vit hors du club (prise de compte croisée)', () => {
      const casDeRefus: [string, Record<string, unknown>][] = [
        ['le compte de la plateforme', { globalRole: 'SUPER_ADMIN' }],
        ['membre d une autre organisation', { _count: { memberships: 2, orders: 0, identities: 0 } }],
        ['un client qui a commandé', { _count: { memberships: 1, orders: 3, identities: 0 } }],
        ['un compte relié à Apple ou Google', { _count: { memberships: 1, orders: 0, identities: 1 } }],
        ['un compte créé par la personne dans l app', { cguAcceptedAt: new Date('2026-10-01') }],
      ];

      it.each(casDeRefus)('refuse : %s', async (_nom, surcharge) => {
        (prisma.organizationMember.findUnique as jest.Mock)
          .mockResolvedValueOnce(membre())
          .mockResolvedValueOnce({ orgRole: OrgRole.ORG_ADMIN });
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(compte(surcharge));

        await expect(
          service.resetMemberPassword(ORG_ID, MEMBER_ID, CALLER_ID, 'CUSTOMER', 'peu-importe'),
        ).rejects.toThrow(ForbiddenException);
        expect(prisma.user.update).not.toHaveBeenCalled();
      });

      it('la plateforme, elle, peut toujours dépanner ce compte', async () => {
        (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce(membre());
        (prisma.user.findUnique as jest.Mock).mockResolvedValue(
          compte({ _count: { memberships: 2, orders: 3, identities: 1 } }),
        );

        await service.resetMemberPassword(
          ORG_ID, MEMBER_ID, CALLER_ID, 'SUPER_ADMIN', 'nouveau-mot-de-passe',
        );
        expect(prisma.user.update).toHaveBeenCalledTimes(1);
      });
    });

    it('un simple membre ne peut rien redefinir', async () => {
      (prisma.organizationMember.findUnique as jest.Mock)
        .mockResolvedValueOnce(membre())
        .mockResolvedValueOnce({ orgRole: OrgRole.OPERATOR });

      await expect(
        service.resetMemberPassword(ORG_ID, MEMBER_ID, CALLER_ID, 'CUSTOMER', 'peu-importe'),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });
});
