import { Module } from '@nestjs/common';
import { ApnsService } from './apns.service';
import { LiveActivityService } from './live-activity.service';
import { LiveActivityController } from './live-activity.controller';
import { FlaixWebhookService } from './flaix-webhook.service';
import { FlaixWebhookController } from './flaix-webhook.controller';

/**
 * LiveActivityModule — phase 21.
 *
 * Regroupe les deux sources qui alimentent le même pipeline :
 *  - `LiveActivityController` : l'app déclare ses activités ;
 *  - `FlaixWebhookController` : Flaix pousse ses événements métier.
 * En aval, `LiveActivityService` construit l'état et `ApnsService` l'envoie.
 *
 * `LiveActivityService` est exporté pour que le module Commandes puisse
 * notifier une transition (source 1 : board opérateur).
 */
@Module({
  controllers: [LiveActivityController, FlaixWebhookController],
  providers: [ApnsService, LiveActivityService, FlaixWebhookService],
  exports: [LiveActivityService],
})
export class LiveActivityModule {}
