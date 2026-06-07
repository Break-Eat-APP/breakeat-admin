import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

/**
 * StatsModule (Phase 15) — manager-dashboard analytics.
 *
 * No imports needed: PrismaModule is global and ConfigModule is global, so
 * PrismaService + ConfigService are injectable directly. Read-only module.
 */
@Module({
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
