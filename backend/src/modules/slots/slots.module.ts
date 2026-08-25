import { Module } from '@nestjs/common';
import { SlotsService } from './slots.service';
import { SlotsController } from './slots.controller';
import { SlotTemplatesService } from './slot-templates.service';
import { SlotTemplatesController } from './slot-templates.controller';

@Module({
  controllers: [SlotsController, SlotTemplatesController],
  providers: [SlotsService, SlotTemplatesService],
  // Exporté : la découverte des lieux matérialise les créneaux du jour à la
  // lecture, donc en dehors de ce module.
  exports: [SlotsService, SlotTemplatesService],
})
export class SlotsModule {}
