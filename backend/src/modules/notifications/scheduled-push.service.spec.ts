import { BadRequestException } from '@nestjs/common';
import { ScheduledPushService } from './scheduled-push.service';
import type { PrismaService } from '../../database/prisma.service';

/**
 * À QUI part une campagne.
 *
 * C'est la question la plus délicate d'une notification : un message qui
 * arrive à des gens qu'il ne concerne pas est la façon la plus rapide de se
 * faire couper les notifications — définitivement, et par les clients
 * eux-mêmes.
 */
describe('ScheduledPushService — le ciblage', () => {
  const ORG = 'cccccccc-3333-4333-8333-333333333333';
  const LIEU = 'aaaaaaaa-1111-4111-8111-111111111111';
  const AUTRE_LIEU = 'bbbbbbbb-2222-4222-8222-222222222222';

  function monter(
    lieuDuClub: string | null = LIEU,
    suiveurs: { userId: string }[] = [],
    lieuDeLEvenement: string | null = LIEU,
  ) {
    const create = jest.fn().mockResolvedValue({ id: 'push-1' });
    const findMany = jest.fn().mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    const favoris = jest.fn().mockResolvedValue(suiveurs);
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ globalRole: 'SUPER_ADMIN' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'actif-1' }, { id: 'actif-2' }]),
      },
      venue: {
        // `findFirst` filtre sur l'organisation : un lieu d'un autre club ne
        // remonte pas.
        findFirst: jest.fn().mockResolvedValue(lieuDuClub ? { id: lieuDuClub } : null),
      },
      event: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ev-1' }),
        findUnique: jest
          .fn()
          .mockResolvedValue(lieuDeLEvenement ? { venueId: lieuDeLEvenement } : null),
      },
      venueFavorite: { findMany: favoris },
      scheduledPush: { create },
      order: { findMany },
      pushToken: { findMany: jest.fn().mockResolvedValue([]) },
    } as unknown as PrismaService;

    // L'ordre des dépendances compte : prisma, expoPush, pushTokens,
    // userNotifications.
    const pushTokens = { tokensForUsers: jest.fn().mockResolvedValue(['jeton-1']) };
    const service = new ScheduledPushService(
      prisma,
      {} as never,
      pushTokens as never,
      {} as never,
    );
    return { service, create, findMany, favoris, pushTokens, prisma };
  }

  const campagne = {
    title: 'Soirée au Vélodrome',
    scheduledAt: new Date(Date.now() + 3600e3).toISOString(),
  };

  it('enregistre le lieu visé', async () => {
    const { service, create } = monter();
    await service.create(ORG, 'moi', { ...campagne, venueId: LIEU });
    expect(create.mock.calls[0][0].data.venueId).toBe(LIEU);
  });

  it('refuse un lieu qui n’appartient pas au club', async () => {
    // Sans cette vérification, un club pourrait s'adresser aux clients d'un
    // autre en devinant un identifiant.
    const { service } = monter(null);
    await expect(
      service.create(ORG, 'moi', { ...campagne, venueId: AUTRE_LIEU }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('sans lieu, vise TOUS les clients du club — comme avant', async () => {
    const { service, create } = monter();
    await service.create(ORG, 'moi', campagne);
    expect(create.mock.calls[0][0].data.venueId).toBeNull();
  });

  describe('les destinataires', () => {
    it('se restreignent au lieu quand il est précisé', async () => {
      const { service, findMany } = monter();
      await service.resolveAudience(ORG, null, LIEU);

      expect(findMany.mock.calls[0][0].where).toMatchObject({
        organizationId: ORG,
        venueId: LIEU,
      });
    });

    it('couvrent tout le club quand il ne l’est pas', async () => {
      const { service, findMany } = monter();
      await service.resolveAudience(ORG, null, null);

      const where = findMany.mock.calls[0][0].where;
      expect(where.organizationId).toBe(ORG);
      expect(where.venueId).toBeUndefined();
    });

    describe('et ceux qui suivent le lieu (favoris, 21/11)', () => {
      // Un lieu piloté par Flaix n'a aucune commande BreakEat : sans les
      // favoris, ses campagnes partaient vers zéro appareil.
      it('ajoutent les clients qui ont le lieu en favori, sans doublon', async () => {
        const { service, pushTokens } = monter(LIEU, [{ userId: 'u2' }, { userId: 'u3' }]);
        const { userIds } = await service['destinataires'](ORG, null, LIEU);

        expect(userIds.sort()).toEqual(['u1', 'u2', 'u3']);
        expect(pushTokens.tokensForUsers).toHaveBeenCalledWith(
          expect.arrayContaining(['u1', 'u2', 'u3']),
        );
      });

      it('atteignent un lieu sans AUCUNE commande BreakEat (cas Flaix)', async () => {
        const { service, findMany } = monter(LIEU, [{ userId: 'fan' }]);
        findMany.mockResolvedValueOnce([]);
        const { userIds } = await service['destinataires'](ORG, null, LIEU);
        expect(userIds).toEqual(['fan']);
      });

      it('restent dans le lieu visé, et toujours dans le club', async () => {
        const { service, favoris } = monter();
        await service['destinataires'](ORG, null, LIEU);
        expect(favoris.mock.calls[0][0].where).toEqual({
          venue: { organizationId: ORG },
          venueId: LIEU,
        });
      });

      it('couvrent tous les lieux du club quand aucun n’est visé', async () => {
        const { service, favoris } = monter();
        await service['destinataires'](ORG, null, null);
        expect(favoris.mock.calls[0][0].where).toEqual({ venue: { organizationId: ORG } });
      });

      it('pour un événement, suivent le lieu de l’événement', async () => {
        const { service, favoris } = monter(LIEU, [], AUTRE_LIEU);
        await service['destinataires'](ORG, 'ev-1', null);
        expect(favoris.mock.calls[0][0].where.venueId).toBe(AUTRE_LIEU);
      });

      it('un événement disparu n’élargit PAS la campagne à tout le club', async () => {
        const { service, favoris } = monter(LIEU, [{ userId: 'fan' }], null);
        const { userIds } = await service['destinataires'](ORG, 'ev-disparu', null);
        expect(favoris).not.toHaveBeenCalled();
        expect(userIds).not.toContain('fan');
      });
    });

    it('sans organisation, c’est la diffusion plateforme — réservée au back-office', async () => {
      // Le super-admin garde ce pouvoir : s'adresser à tous les porteurs de
      // l'application, tous clubs confondus.
      const { service, prisma, pushTokens } = monter();
      const { userIds } = await service.destinataires(null, null);
      // Tous les comptes ACTIFS (vérification Codex du 22/11) : le même public
      // que l'envoi immédiat « à tous ».
      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        select: { id: true },
      });
      expect(userIds).toEqual(['actif-1', 'actif-2']);
      expect(pushTokens.tokensForUsers).toHaveBeenCalledWith(['actif-1', 'actif-2']);
    });
  });
});
