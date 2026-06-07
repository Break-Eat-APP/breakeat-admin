import { Module } from '@nestjs/common';
import { BackofficeService } from './backoffice.service';
import { BackofficeController } from './backoffice.controller';

/**
 * BackofficeModule — cross-tenant supervision API for SUPER_ADMIN.
 * PrismaService is provided globally; ConfigService comes from the global
 * ConfigModule, so no extra imports are needed here.
 */
@Module({
  controllers: [BackofficeController],
  providers: [BackofficeService],
  exports: [BackofficeService],
})
export class BackofficeModule {}
