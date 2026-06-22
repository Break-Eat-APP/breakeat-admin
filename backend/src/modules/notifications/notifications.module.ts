import { Module } from '@nestjs/common';
import { ExpoPushService } from './expo-push.service';
import { PushTokensService } from './push-tokens.service';
import { PushTokensController } from './push-tokens.controller';
import { OrderNotificationsService } from './order-notifications.service';
import { ScheduledPushService } from './scheduled-push.service';
import { ScheduledPushController } from './scheduled-push.controller';

/**
 * NotificationsModule — fondation push Expo.
 *
 * Fournit :
 *  - ExpoPushService : envoi de messages push via l'API Expo.
 *  - PushTokensService : gestion des jetons d'appareil par utilisateur.
 *
 * Exporté pour les futures briques C1 (notifs par étape de commande),
 * C2 (push programmés) et C3 (campagne -50 % auto), qui s'appuieront dessus.
 */
@Module({
  controllers: [PushTokensController, ScheduledPushController],
  providers: [ExpoPushService, PushTokensService, OrderNotificationsService, ScheduledPushService],
  exports: [ExpoPushService, PushTokensService, OrderNotificationsService, ScheduledPushService],
})
export class NotificationsModule {}
