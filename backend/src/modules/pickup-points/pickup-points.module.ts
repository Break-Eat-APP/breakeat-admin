import { Module } from '@nestjs/common';
import { PickupPointsService } from './pickup-points.service';
import { PickupPointsController } from './pickup-points.controller';

@Module({
  controllers: [PickupPointsController],
  providers: [PickupPointsService],
  exports: [PickupPointsService],
})
export class PickupPointsModule {}
