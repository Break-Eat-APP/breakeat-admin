import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

/**
 * Le rattachement d'une identité extérieure à un compte.
 *
 * C'est le seul endroit du projet où quelqu'un obtient un compte sans mot de
 * passe. Les règles verrouillées ici sont celles dont l'oubli donnerait le
 * compte d'un client à quelqu'un d'autre :
 *
 *  — le sujet du fournisseur prime sur l'adresse ;
 *  — une adresse NON certifiée ne rattache rien.
 */
describe('AuthService — connexion Apple / Google', () => {
  const identite = {
    provider: 'apple' as const,
    subject: '000123.abc.0001',
    email: 'jo@club.fr',
    emailVerifie: true,
  };

  function monter(overrides: {
    identiteVerifiee?: typeof identite;
    identityRow?: unknown;
    userRow?: unknown;
  }) {
    const prisma = {
      userIdentity: {
        findUnique: jest.fn().mockResolvedValue(overrides.identityRow ?? null),
        create: jest.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(overrides.userRow ?? null),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'u-neuf', isActive: true, globalRole: 'CUSTOMER', ...data }),
        ),
      },
      refreshToken: { create: jest.fn().mockResolvedValue({}) },
      group: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const social = {
      verifier: jest.fn().mockResolvedValue(overrides.identiteVerifiee ?? identite),
      disponibles: jest.fn().mockReturnValue(['apple']),
    };
    const service = new AuthService(
      prisma as never,
      { create: jest.fn() } as never,
      { syncDomainGroups: jest.fn() } as never,
      { sign: jest.fn().mockReturnValue('jeton') } as never,
      { get: jest.fn() } as never,
      social as never,
    );
    // `syncDomainGroups` est privé et interroge la base : neutralisé, il n'est
    // pas le sujet de ces tests.
    (service as unknown as { syncDomainGroups: () => Promise<void> }).syncDomainGroups = () =>
      Promise.resolve();
    return { service, prisma, social };
  }

  it('reconnaît le client à son sujet Apple, même si son adresse a changé', async () => {
    const { service, prisma } = monter({
      identityRow: {
        user: { id: 'u-1', email: 'ancienne@club.fr', isActive: true, passwordHash: null },
      },
    });

    const res = await service.connexionSociale({ provider: 'apple', token: 'jwt' });

    expect(res.user.id).toBe('u-1');
    // Aucune recherche par adresse : le sujet a suffi.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
  });

  it('rattache au compte existant plutôt que d’en ouvrir un second', async () => {
    const { service, prisma } = monter({
      userRow: { id: 'u-2', email: 'jo@club.fr', isActive: true, passwordHash: 'argon2...' },
    });

    const res = await service.connexionSociale({ provider: 'apple', token: 'jwt' });

    expect(res.user.id).toBe('u-2');
    expect(prisma.user.create).not.toHaveBeenCalled();
    expect(prisma.userIdentity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u-2' }) }),
    );
  });

  it('REFUSE de rattacher sur une adresse non certifiée', async () => {
    // Le cœur du sujet : sans certification, déclarer l'adresse de quelqu'un
    // suffirait à obtenir son compte.
    const { service, prisma } = monter({
      identiteVerifiee: { ...identite, emailVerifie: false },
      userRow: { id: 'u-3', email: 'jo@club.fr', isActive: true, passwordHash: 'argon2...' },
    });

    await expect(service.connexionSociale({ provider: 'apple', token: 'jwt' })).rejects.toThrow(
      UnauthorizedException,
    );
    expect(prisma.userIdentity.create).not.toHaveBeenCalled();
  });

  it('crée un compte sans mot de passe, et retient le nom de la première fois', async () => {
    const { service, prisma } = monter({});

    const res = await service.connexionSociale({
      provider: 'apple',
      token: 'jwt',
      displayName: 'Jo Martin',
    });

    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: 'jo@club.fr',
        passwordHash: null,
        displayName: 'Jo Martin',
      }),
    });
    expect(res.accessToken).toBeDefined();
  });

  it('à défaut de nom, prend la partie gauche de l’adresse — jamais un champ vide', async () => {
    const { service, prisma } = monter({});
    await service.connexionSociale({ provider: 'apple', token: 'jwt' });
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ displayName: 'jo' }),
    });
  });

  it('refuse un compte désactivé', async () => {
    const { service } = monter({
      identityRow: { user: { id: 'u-4', email: 'jo@club.fr', isActive: false, passwordHash: null } },
    });
    await expect(service.connexionSociale({ provider: 'apple', token: 'jwt' })).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
