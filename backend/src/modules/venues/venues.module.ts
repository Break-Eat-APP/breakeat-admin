import { Module } from '@nestjs/common';
import { VenuesService } from './venues.service';
import { VenuesController } from './venues.controller';
import { PublicVenuesController } from './public-venues.controller';

@Module({
  controllers: [VenuesController, PublicVenuesController],
  providers: [VenuesService],
  exports: [VenuesService],
})
export class VenuesModule {}
