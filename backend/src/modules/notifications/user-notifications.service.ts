import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Les notifications d'un client, telles que la cloche les compte.
 *
 * Un push est éphémère : balayé de l'écran, il n'existe plus. La cloche doit
 * pourtant dire combien de messages attendent — y compris ceux arrivés
 * téléphone éteint, ou avant l'installation d'un second appareil. Le compte vit
 * donc au SERVEUR : gardé dans l'application, il ne survivrait ni à une
 * réinstallation ni au passage d'un téléphone à l'autre.
 */
@Injectable()
export class UserNotificationsService {
  private readonly logger = new Logger(UserNotificationsService.name);

  /** Au-delà, on ne rend plus : personne ne fait défiler mille annonces. */
  private static readonly PLAFOND = 50;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Archive un message pour chacun de ses destinataires.
   *
   * Appelé au moment de l'envoi d'une campagne. En une seule écriture : une
   * campagne peut viser des milliers de clients, et autant d'allers-retours
   * tiendraient la base occupée pendant tout l'envoi.
   */
  async archiver(params: {
    userIds: string[];
    organizationId: string | null;
    title: string;
    body: string;
  }): Promise<number> {
    if (params.userIds.length === 0) return 0;
    const { count } = await this.prisma.userNotification.createMany({
      data: params.userIds.map((userId) => ({
        userId,
        organizationId: params.organizationId,
        title: params.title,
        body: params.body,
      })),
    });
    this.logger.log(`${count} notification(s) archivée(s) : « ${params.title} »`);
    return count;
  }

  /** La liste et le nombre de non-lues, en un appel — la cloche a besoin des deux. */
  async lister(userId: string) {
    const [notifications, nonLues] = await Promise.all([
      this.prisma.userNotification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: UserNotificationsService.PLAFOND,
        select: { id: true, title: true, body: true, readAt: true, createdAt: true },
      }),
      this.prisma.userNotification.count({ where: { userId, readAt: null } }),
    ]);

    return {
      nonLues,
      notifications: notifications.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        lue: n.readAt !== null,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Marque tout comme lu.
   *
   * Tout, et pas une par une : le geste du client est d'ouvrir la cloche, pas
   * d'accuser réception de chaque ligne. `readAt: null` dans la condition évite
   * de réécrire des lignes déjà lues — sur un compte ancien, la différence se
   * compte en milliers.
   */
  async toutMarquerLu(userId: string): Promise<number> {
    const { count } = await this.prisma.userNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return count;
  }
}
