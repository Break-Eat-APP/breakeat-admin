import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PublicOrdersController } from './public-orders.controller';
import { OrderStateMachineService } from './order-state-machine.service';
import { RealtimeModule } from '../realtime/realtime.module';
import { SlotsModule } from '../slots/slots.module';
import { GroupsModule } from '../groups/groups.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { LoyaltyModule } from '../loyalty/loyalty.module';
import { LiveActivityModule } from '../live-activity/live-activity.module';

@Module({
  imports: [
    // Signe les liens de reçu : courts, a usage unique dans le temps, et
    // portant UNIQUEMENT le droit de lire ce reçu-la.
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('app.jwt.secret'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    RealtimeModule,
    SlotsModule,
    GroupsModule,
    NotificationsModule,
    LoyaltyModule,
    LiveActivityModule,
  ],
  controllers: [OrdersController, PublicOrdersController],
  providers: [OrdersService, OrderStateMachineService],
  exports: [OrdersService, OrderStateMachineService],
})
export class OrdersModule {}
