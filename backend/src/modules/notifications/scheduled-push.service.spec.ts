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

  function monter(lieuDuClub: string | null = LIEU) {
    const create = jest.fn().mockResolvedValue({ id: 'push-1' });
    const findMany = jest.fn().mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ globalRole: 'SUPER_ADMIN' }) },
      venue: {
        // `findFirst` filtre sur l'organisation : un lieu d'un autre club ne
        // remonte pas.
        findFirst: jest.fn().mockResolvedValue(lieuDuClub ? { id: lieuDuClub } : null),
      },
      event: { findFirst: jest.fn().mockResolvedValue({ id: 'ev-1' }) },
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
    return { service, create, findMany, prisma };
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

    it('sans organisation, c’est la diffusion plateforme — réservée au back-office', async () => {
      // Le super-admin garde ce pouvoir : s'adresser à tous les porteurs de
      // l'application, tous clubs confondus.
      const { service, prisma } = monter();
      await service.resolveAudience(null, null);
      expect(prisma.pushToken.findMany).toHaveBeenCalled();
    });
  });
});
