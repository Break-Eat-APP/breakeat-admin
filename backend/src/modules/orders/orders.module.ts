import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { OrderStateMachineService } from './order-state-machine.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderStateMachineService],
  exports: [OrdersService, OrderStateMachineService],
})
export class OrdersModule {}
