import { Module } from '@nestjs/common';
import { EventsService } from './events.service';
import { EventsController } from './events.controller';
import { PublicEventsController } from './public-events.controller';
import { GroupsModule } from '../groups/groups.module';
// PHASE 23 — la lecture publique des créneaux matérialise ceux du jour.
import { SlotsModule } from '../slots/slots.module';

@Module({
  imports: [GroupsModule, SlotsModule],
  controllers: [EventsController, PublicEventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
