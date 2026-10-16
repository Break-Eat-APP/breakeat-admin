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
    // Apple ne met jamais le nom dans son jeton : il le remet a l'application.
    firstName: null as string | null,
    lastName: null as string | null,
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
        deleteMany: jest.fn(),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue(overrides.userRow ?? null),
        create: jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ id: 'u-neuf', isActive: true, globalRole: 'CUSTOMER', ...data }),
        ),
        update: jest.fn(),
      },
      refreshToken: { create: jest.fn().mockResolvedValue({}), deleteMany: jest.fn() },
      pushToken: { deleteMany: jest.fn() },
      group: { findMany: jest.fn().mockResolvedValue([]) },
      // La libération d'un compte archivé passe par une transaction.
      $transaction: jest.fn().mockResolvedValue([]),
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

  // Un compte archivé ne rouvre pas par son identité Apple : il la RELÂCHE, et
  // la personne repart d'un compte neuf. La libération elle-même (adresse,
  // identités, sessions) est vérifiée sur base réelle, dans
  // test/integration/archives.int-spec.ts.
  it('identité liée à un compte archivé : un compte neuf, jamais l’ancien', async () => {
    const archive = { id: 'u-4', email: 'jo@club.fr', isActive: false, archivedEmail: null };
    const { service, prisma } = monter({
      identityRow: { user: { ...archive, passwordHash: null } },
    });
    // La libération relit le compte archivé par son identifiant ; la recherche
    // par adresse, elle, ne trouve plus personne une fois l'adresse rendue.
    prisma.user.findUnique.mockImplementation(({ where }: { where: { id?: string } }) =>
      Promise.resolve(where.id === 'u-4' ? archive : null),
    );

    const res = await service.connexionSociale({ provider: 'apple', token: 'jwt' });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(res.user.id).toBe('u-neuf');
    expect(prisma.userIdentity.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u-neuf' }) }),
    );
  });

  // ─── Le nom, pour pre-remplir la commande chez Flaix ──────────
  //
  // Sans lui, un client connecte par Apple ou Google retape son identite a
  // chaque match — alors que le fournisseur nous l'avait donnee.

  it('GOOGLE : le nom du JETON est enregistre a la creation', async () => {
    const { service, prisma } = monter({
      identiteVerifiee: {
        ...identite,
        provider: 'google' as never,
        firstName: 'Jo',
        lastName: 'Dupont',
      },
    });

    await service.connexionSociale({ provider: 'google', token: 'jwt' });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ firstName: 'Jo', lastName: 'Dupont' }),
      }),
    );
  });

  it('APPLE : le nom vient de l’application, et il est decoupe', async () => {
    // Apple ne le donne qu'a la PREMIERE autorisation. Le perdre la, c'est le
    // perdre pour toujours.
    const { service, prisma } = monter({});

    await service.connexionSociale({
      provider: 'apple',
      token: 'jwt',
      firstName: 'Jean-Pierre',
      lastName: 'De La Tour',
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ firstName: 'Jean-Pierre', lastName: 'De La Tour' }),
      }),
    );
  });

  it('un nom en espaces vaut un nom absent', async () => {
    const { service, prisma } = monter({});

    await service.connexionSociale({
      provider: 'apple',
      token: 'jwt',
      firstName: '   ',
      lastName: '',
    });

    expect(prisma.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ firstName: null, lastName: null }),
      }),
    );
  });

  it('un compte EXISTANT sans nom se complete tout seul', async () => {
    // Google renvoie le nom a chaque connexion : les comptes ouverts avant
    // qu'on sache le lire se remplissent a la prochaine ouverture.
    const { service, prisma } = monter({
      userRow: { id: 'u-1', email: 'jo@club.fr', isActive: true, firstName: null, lastName: null },
      identiteVerifiee: {
        ...identite,
        provider: 'google' as never,
        firstName: 'Jo',
        lastName: 'Dupont',
      },
    });
    prisma.user.update.mockResolvedValue({
      id: 'u-1',
      email: 'jo@club.fr',
      isActive: true,
      firstName: 'Jo',
      lastName: 'Dupont',
    });

    await service.connexionSociale({ provider: 'google', token: 'jwt' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { firstName: 'Jo', lastName: 'Dupont' },
    });
  });

  it('… mais un nom DEJA saisi n’est jamais ecrase', async () => {
    // Si le client a corrige son prenom dans Break Eat, c'est le sien qui
    // reste : un fournisseur ne reecrit pas par-dessus une saisie humaine.
    const { service, prisma } = monter({
      userRow: {
        id: 'u-1',
        email: 'jo@club.fr',
        isActive: true,
        firstName: 'Joséphine',
        lastName: 'Dupont',
      },
      identiteVerifiee: {
        ...identite,
        provider: 'google' as never,
        firstName: 'Jo',
        lastName: 'Dupont',
      },
    });

    await service.connexionSociale({ provider: 'google', token: 'jwt' });

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('seul le champ MANQUANT est complete', async () => {
    const { service, prisma } = monter({
      userRow: {
        id: 'u-1',
        email: 'jo@club.fr',
        isActive: true,
        firstName: 'Joséphine',
        lastName: null,
      },
      identiteVerifiee: {
        ...identite,
        provider: 'google' as never,
        firstName: 'Jo',
        lastName: 'Dupont',
      },
    });
    prisma.user.update.mockResolvedValue({ id: 'u-1', email: 'jo@club.fr', isActive: true });

    await service.connexionSociale({ provider: 'google', token: 'jwt' });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'u-1' },
      data: { lastName: 'Dupont' },
    });
  });
});
