import { Module } from '@nestjs/common';
import { BackofficeService } from './backoffice.service';
import { BackofficeController } from './backoffice.controller';
import { NotificationsModule } from '../notifications/notifications.module';

/**
 * BackofficeModule — cross-tenant supervision API for SUPER_ADMIN.
 * PrismaService is provided globally; ConfigService comes from the global
 * ConfigModule, so no extra imports are needed here.
 * NotificationsModule fournit ExpoPushService + PushTokensService pour
 * l'endpoint de broadcast push.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [BackofficeController],
  providers: [BackofficeService],
  exports: [BackofficeService],
})
export class BackofficeModule {}
