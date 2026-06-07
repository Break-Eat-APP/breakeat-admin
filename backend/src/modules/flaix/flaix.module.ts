import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FlaixService } from './flaix.service';
import { FlaixController } from './flaix.controller';

/**
 * FlaixModule — the integration boundary between BREAK EAT and the Flaix AI engine.
 *
 * Per FLAIX_CONTRACT.md, all Flaix calls must go through FlaixService.
 * No other module should import the Flaix HTTP client directly.
 *
 * FlaixService is exported for use by: OrdersModule, SlotsModule, DashboardsModule.
 * FlaixController exposes read-only dashboard endpoints (Phase 8).
 *
 * Configuration (app.config.ts):
 *   FLAIX_API_URL — base URL of the Flaix AI engine (optional — stub when absent)
 *   FLAIX_API_KEY — API key for authentication (optional)
 */
@Module({
  imports: [ConfigModule],
  controllers: [FlaixController],
  providers: [FlaixService],
  exports: [FlaixService],
})
export class FlaixModule {}
