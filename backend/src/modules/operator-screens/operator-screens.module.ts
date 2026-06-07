import { Module } from '@nestjs/common';
import { OperatorScreensService } from './operator-screens.service';
import { OperatorScreenTemplatesController } from './operator-screen-templates.controller';
import { EventOperatorScreensController } from './event-operator-screens.controller';

/**
 * Phase 11 — Configurable, reusable operator-dashboard screens.
 * Templates are org-level; EventOperatorScreen applies them per event.
 */
@Module({
  providers: [OperatorScreensService],
  controllers: [OperatorScreenTemplatesController, EventOperatorScreensController],
  exports: [OperatorScreensService],
})
export class OperatorScreensModule {}
