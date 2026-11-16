import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { PublicEventsController } from './public-events.controller';
import { OuvertureAutomatiqueService } from './ouverture-automatique.service';
import { GroupsModule } from '../groups/groups.module';
// PHASE 23 — la lecture publique des créneaux matérialise ceux du jour.
import { SlotsModule } from '../slots/slots.module';

@Module({
  imports: [GroupsModule, SlotsModule],
  controllers: [EventsController, PublicEventsController],
  // L'ouverture et la fermeture automatiques des événements (16/11/2026).
  providers: [EventsService, OuvertureAutomatiqueService],
  exports: [EventsService],
})
export class EventsModule {}
