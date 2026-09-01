import { Test, TestingModule } from '@nestjs/testing';
import {
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
            $transaction: jest.fn(),
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
    it('adds member when caller is ORG_ADMIN', async () => {
      (prisma.organizationMember.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMembership(OrgRole.ORG_ADMIN)) // caller check
        .mockResolvedValueOnce(null);                              // duplicate check
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: TARGET_ID });
      const created = { userId: TARGET_ID, organizationId: ORG_ID, orgRole: OrgRole.OPERATOR };
      (prisma.organizationMember.create as jest.Mock).mockResolvedValue(created);

      const result = await service.addMember(ORG_ID, CALLER_ID, 'CUSTOMER', TARGET_ID, OrgRole.OPERATOR);
      expect(result).toEqual(created);
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

    it('throws NotFoundException when target user does not exist', async () => {
      (prisma.organizationMember.findUnique as jest.Mock).mockResolvedValueOnce(
        mockMembership(OrgRole.ORG_ADMIN),
      );
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null); // target not found

      await expect(
        service.addMember(ORG_ID, CALLER_ID, 'CUSTOMER', TARGET_ID, OrgRole.OPERATOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when target is already a member', async () => {
      (prisma.organizationMember.findUnique as jest.Mock)
        .mockResolvedValueOnce(mockMembership(OrgRole.ORG_ADMIN)) // caller check
        .mockResolvedValueOnce({ userId: TARGET_ID });              // duplicate found
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: TARGET_ID });

      await expect(
        service.addMember(ORG_ID, CALLER_ID, 'CUSTOMER', TARGET_ID, OrgRole.OPERATOR),
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

    it('refuse un e-mail inconnu sans mot de passe provisoire', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.inviteByEmail(ORG_ID, CALLER_ID, 'SUPER_ADMIN', EMAIL, OrgRole.MANAGER),
      ).rejects.toThrow(NotFoundException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  // --- resetMemberPassword -------------------------------------

  describe('resetMemberPassword', () => {
    const MEMBER_ID = 'member-1';

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
