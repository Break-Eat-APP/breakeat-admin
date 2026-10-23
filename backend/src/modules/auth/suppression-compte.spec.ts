import { BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';

import { AuthService } from './auth.service';
import { SocialIdentityService } from './social-identity.service';
import { UsersService } from '../users/users.service';
import { GroupsService } from '../groups/groups.service';
import { PrismaService } from '../../database/prisma.service';
import { adresseSupprimee, adresseTemoin } from '../../common/helpers/liberation-archives';

/**
 * SUPPRIMER SON COMPTE — ce que l'app doit pouvoir promettre.
 *
 * Apple l'exige (5.1.1(v)) et les données personnelles doivent réellement
 * partir. Mais la comptabilité du club, elle, ne bouge pas : ses commandes
 * restent, rattachées à une ligne qui ne désigne plus personne.
 *
 * C'est la tension que ces tests tiennent. Les deux moitiés comptent : un
 * effacement trop zélé réécrirait les comptes d'un tiers, un effacement trop
 * timide ferait refuser l'application sur l'App Store.
 */
describe('AuthService — suppression de compte par son titulaire', () => {
  const MOI = 'user-1';

  /** Le compte tel que la base le rend, et ce qui l'entoure. */
  function monter(
    opts: {
      compte?: Record<string, unknown> | null;
      /** Nombre d'AUTRES super-admins actifs. */
      autresSuperAdmins?: number;
      /** Les organisations dont ce compte est ORG_ADMIN. */
      administre?: { organizationId: string; organization: { name: string } }[];
      /** Nombre d'AUTRES administrateurs actifs, par organisation. */
      autresAdmins?: number;
    } = {},
  ) {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(
          opts.compte === undefined
            ? { id: MOI, email: 'jo@exemple.fr', globalRole: 'CUSTOMER' }
            : opts.compte,
        ),
        count: jest.fn().mockResolvedValue(opts.autresSuperAdmins ?? 1),
        update: jest.fn(),
      },
      organizationMember: {
        findMany: jest.fn().mockResolvedValue(opts.administre ?? []),
        count: jest.fn().mockResolvedValue(opts.autresAdmins ?? 1),
        deleteMany: jest.fn(),
      },
      userIdentity: { deleteMany: jest.fn() },
      refreshToken: { deleteMany: jest.fn(), create: jest.fn() },
      pushToken: { deleteMany: jest.fn() },
      cart: { deleteMany: jest.fn() },
      userNotification: { deleteMany: jest.fn() },
      groupMember: { deleteMany: jest.fn() },
      // Les COMMENTAIRES de note sont effaces, les etoiles restent.
      orderRating: { updateMany: jest.fn() },
      // Volontairement ABSENT du service : si un jour quelqu'un l'y ajoute, le
      // test « les commandes ne bougent pas » tombera, et c'est le but.
      order: { deleteMany: jest.fn() },
      $transaction: jest.fn(async (ops: unknown[]) => ops),
    };
    return { prisma };
  }

  async function service(prisma: unknown): Promise<AuthService> {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: UsersService, useValue: { findById: jest.fn() } },
        { provide: GroupsService, useValue: { applyDomainMembershipsForUser: jest.fn() } },
        {
          provide: SocialIdentityService,
          useValue: { verifier: jest.fn(), disponibles: jest.fn().mockReturnValue([]) },
        },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue('secret') } },
      ],
    }).compile();
    return module.get(AuthService);
  }

  it('anonymise le compte : plus de nom, plus de téléphone, plus d’adresse', async () => {
    const { prisma } = monter();

    await expect((await service(prisma)).supprimerMonCompte(MOI)).resolves.toEqual({
      supprime: true,
    });

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.firstName).toBeNull();
    expect(data.lastName).toBeNull();
    expect(data.phone).toBeNull();
    expect(data.passwordHash).toBeNull();
    expect(data.isActive).toBe(false);
    expect(data.displayName).toBe('Compte supprimé');
  });

  it('libère l’adresse, et ne la conserve NULLE PART', async () => {
    const { prisma } = monter();
    await (await service(prisma)).supprimerMonCompte(MOI);

    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.email).toBe(adresseSupprimee(MOI));
    // Un ARCHIVAGE garde l'adresse d'origine ici, pour pouvoir revenir dessus.
    // Une SUPPRESSION n'a rien à garder : c'est toute la différence, et c'est
    // ce qu'Apple vérifie.
    expect(data.archivedEmail).toBeNull();
    expect(data.email).not.toBe(adresseTemoin(MOI));
    expect(data.email).not.toContain('jo@exemple.fr');
  });

  it('coupe tout ce qui rouvrirait la porte, et tout ce qui le désigne', async () => {
    const { prisma } = monter();
    await (await service(prisma)).supprimerMonCompte(MOI);

    // Les identités d'abord : sans elles, « Continuer avec Apple » retrouverait
    // le compte par son sujet et le ressusciterait.
    expect(prisma.userIdentity.deleteMany).toHaveBeenCalledWith({ where: { userId: MOI } });
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { userId: MOI } });
    // L'appareil ne doit plus recevoir les annonces d'un compte fermé.
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({ where: { userId: MOI } });
    expect(prisma.cart.deleteMany).toHaveBeenCalledWith({ where: { userId: MOI } });
    expect(prisma.userNotification.deleteMany).toHaveBeenCalledWith({ where: { userId: MOI } });
    expect(prisma.organizationMember.deleteMany).toHaveBeenCalledWith({ where: { userId: MOI } });
  });

  it('NE TOUCHE PAS aux commandes — ce sont les comptes du club', async () => {
    const { prisma } = monter();
    await (await service(prisma)).supprimerMonCompte(MOI);

    // Les effacer retirerait leur montant de la comptabilité, des déclarations
    // de TVA et des reçus déjà remis. Le client a le droit de disparaître, pas
    // de réécrire les comptes de quelqu'un d'autre.
    expect(prisma.order.deleteMany).not.toHaveBeenCalled();
  });

  it('fait tout dans UNE transaction', async () => {
    const { prisma } = monter();
    await (await service(prisma)).supprimerMonCompte(MOI);

    // Un compte à moitié anonymisé — nom effacé, session encore valable — est
    // pire que l'état de départ, et invisible depuis l'écran qui vient
    // d'annoncer « compte supprimé ».
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('un compte inconnu répond 404', async () => {
    const { prisma } = monter({ compte: null });
    await expect((await service(prisma)).supprimerMonCompte(MOI)).rejects.toThrow(
      NotFoundException,
    );
  });

  // ─── Les deux portes qu'on ne se laisse pas claquer dans le dos ──────

  it('refuse au DERNIER administrateur de la plateforme', async () => {
    const { prisma } = monter({
      compte: { id: MOI, email: 'admin@exemple.fr', globalRole: 'SUPER_ADMIN' },
      autresSuperAdmins: 0,
    });

    await expect((await service(prisma)).supprimerMonCompte(MOI)).rejects.toThrow(
      /dernier administrateur de la plateforme/,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('… mais l’accepte s’il reste un collègue', async () => {
    const { prisma } = monter({
      compte: { id: MOI, email: 'admin@exemple.fr', globalRole: 'SUPER_ADMIN' },
      autresSuperAdmins: 1,
    });

    await expect((await service(prisma)).supprimerMonCompte(MOI)).resolves.toEqual({
      supprime: true,
    });
  });

  it('refuse au DERNIER administrateur d’un club, en le nommant', async () => {
    const { prisma } = monter({
      administre: [{ organizationId: 'org-1', organization: { name: 'Stade Vélodrome' } }],
      autresAdmins: 0,
    });

    // Nommer le club est ce qui rend le refus actionnable : sans lui, un
    // manager de trois clubs ne saurait pas lequel débloquer.
    await expect((await service(prisma)).supprimerMonCompte(MOI)).rejects.toThrow(
      /Stade Vélodrome/,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('… mais l’accepte s’il reste un autre administrateur du club', async () => {
    const { prisma } = monter({
      administre: [{ organizationId: 'org-1', organization: { name: 'Stade Vélodrome' } }],
      autresAdmins: 1,
    });

    await expect((await service(prisma)).supprimerMonCompte(MOI)).resolves.toEqual({
      supprime: true,
    });
  });

  it('un CLIENT ordinaire ne rencontre aucune de ces gardes', async () => {
    // Le cas de l'examinateur de l'App Store : il crée un compte ordinaire, et
    // sa suppression doit passer sans condition ni message d'erreur.
    const { prisma } = monter({ autresSuperAdmins: 0, autresAdmins: 0 });

    await expect((await service(prisma)).supprimerMonCompte(MOI)).resolves.toEqual({
      supprime: true,
    });
    expect(prisma.user.count).not.toHaveBeenCalled();
  });

  it('le refus est une demande, pas une panne (400, pas 500)', async () => {
    const { prisma } = monter({
      compte: { id: MOI, email: 'admin@exemple.fr', globalRole: 'SUPER_ADMIN' },
      autresSuperAdmins: 0,
    });

    await expect((await service(prisma)).supprimerMonCompte(MOI)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
