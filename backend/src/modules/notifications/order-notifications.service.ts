import { Injectable, Logger } from '@nestjs/common';
import { FlagScope } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ExpoPushService } from './expo-push.service';
import { PushTokensService } from './push-tokens.service';

/**
 * OrderNotificationsService (C1) — notifications push par étape de commande.
 *
 * Les modèles (titre/corps activé par statut) sont stockés dans app_settings
 * sous la clé `app.notifications`, scope ORGANIZATION — éditables depuis le
 * dashboard via l'API app-settings existante.
 *
 * Appelé en fire-and-forget après chaque transition de statut : une erreur
 * d'envoi ne doit jamais casser la transition de commande.
 */

export const NOTIFICATIONS_SETTING_KEY = 'app.notifications';

interface StatusTemplate {
  enabled: boolean;
  title: string;
  body: string;
}
interface NotificationConfig {
  statuses?: Record<string, StatusTemplate>;
}

interface OrderLike {
  id: string;
  userId: string;
  organizationId: string;
  status: string;
  publicOrderNumber: string;
}

@Injectable()
export class OrderNotificationsService {
  private readonly logger = new Logger(OrderNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly expoPush: ExpoPushService,
    private readonly pushTokens: PushTokensService,
  ) {}

  /** Remplace les variables disponibles dans un modèle. */
  private render(tpl: string, order: OrderLike): string {
    return tpl.replace(/\{orderNumber\}/g, order.publicOrderNumber);
  }

  async notifyStatusChange(order: OrderLike): Promise<void> {
    try {
      const setting = await this.prisma.appSetting.findFirst({
        where: { key: NOTIFICATIONS_SETTING_KEY, scope: FlagScope.ORGANIZATION, scopeId: order.organizationId },
      });
      const config = (setting?.value ?? null) as NotificationConfig | null;
      const tpl = config?.statuses?.[order.status];
      if (!tpl || !tpl.enabled || !tpl.title) return;

      const tokens = await this.pushTokens.tokensForUsers([order.userId]);
      if (tokens.length === 0) return;

      const result = await this.expoPush.send(
        tokens.map((to) => ({
          to,
          title: this.render(tpl.title, order),
          body: this.render(tpl.body ?? '', order),
          data: { orderId: order.id, status: order.status },
        })),
      );
      if (result.invalidTokens.length > 0) {
        await this.pushTokens.purgeInvalid(result.invalidTokens);
      }
      this.logger.log(`Notif statut ${order.status} pour commande ${order.publicOrderNumber}: ${result.sent} envoi(s)`);
    } catch (err) {
      // Jamais bloquant pour la transition de commande.
      this.logger.warn(`notifyStatusChange a échoué (non bloquant): ${err instanceof Error ? err.message : err}`);
    }
  }
}
