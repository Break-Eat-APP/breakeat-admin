import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PublicOrdersController } from './public-orders.controller';
import { OrderStateMachineService } from './order-state-machine.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { SlotsModule } from '../slots/slots.module';
import { GroupsModule } from '../groups/groups.module';

@Module({
  imports: [RealtimeModule, SlotsModule, GroupsModule],
  controllers: [OrdersController, PublicOrdersController],
  providers: [OrdersService, OrderStateMachineService],
  exports: [OrdersService, OrderStateMachineService],
})
export class OrdersModule {}
