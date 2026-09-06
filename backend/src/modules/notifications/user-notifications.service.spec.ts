import { UserNotificationsService } from './user-notifications.service';
import type { PrismaService } from '../../database/prisma.service';

/**
 * La cloche compte ce qui ATTEND le client. Un compte faux — trop haut, ou
 * jamais remis à zéro — use la confiance dans la pastille jusqu'à ce qu'on
 * cesse de la regarder.
 */
describe('UserNotificationsService', () => {
  const USER = 'user-1';
  let prisma: {
    userNotification: {
      createMany: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let service: UserNotificationsService;

  beforeEach(() => {
    prisma = {
      userNotification: {
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    service = new UserNotificationsService(prisma as unknown as PrismaService);
  });

  describe('archiver', () => {
    it('écrit une ligne par destinataire, en UNE fois', async () => {
      // Une campagne peut viser des milliers de clients : autant
      // d'allers-retours tiendraient la base occupée pendant tout l'envoi.
      prisma.userNotification.createMany.mockResolvedValue({ count: 3 });

      const n = await service.archiver({
        userIds: ['a', 'b', 'c'],
        organizationId: 'org-1',
        title: 'Buvette ouverte',
        body: 'Venez',
      });

      expect(n).toBe(3);
      expect(prisma.userNotification.createMany).toHaveBeenCalledTimes(1);
      expect(prisma.userNotification.createMany.mock.calls[0][0].data).toHaveLength(3);
    });

    it('n’écrit rien pour un public vide', async () => {
      await service.archiver({ userIds: [], organizationId: null, title: 't', body: 'b' });
      expect(prisma.userNotification.createMany).not.toHaveBeenCalled();
    });
  });

  describe('lister', () => {
    it('rend les messages ET le nombre de non-lues', async () => {
      // La cloche a besoin des deux : le nombre pour la pastille, la liste pour
      // l'écran. Deux appels séparés les laisseraient diverger à une seconde
      // d'intervalle — une pastille à 3 au-dessus d'une liste qui en montre 2.
      prisma.userNotification.findMany.mockResolvedValue([
        { id: '1', title: 'A', body: 'a', readAt: null, createdAt: new Date() },
        { id: '2', title: 'B', body: 'b', readAt: new Date(), createdAt: new Date() },
      ]);
      prisma.userNotification.count.mockResolvedValue(1);

      const res = await service.lister(USER);

      expect(res.nonLues).toBe(1);
      expect(res.notifications[0].lue).toBe(false);
      expect(res.notifications[1].lue).toBe(true);
    });
  });

  describe('toutMarquerLu', () => {
    it('ne réécrit QUE les non-lues', async () => {
      // Sans `readAt: null` dans la condition, chaque ouverture de la cloche
      // réécrirait tout l'historique du compte.
      await service.toutMarquerLu(USER);

      const where = prisma.userNotification.updateMany.mock.calls[0][0].where;
      expect(where).toEqual({ userId: USER, readAt: null });
    });
  });
});
