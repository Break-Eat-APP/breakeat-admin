import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PretController } from './pret.controller';

@Module({
  controllers: [HealthController, PretController],
})
export class HealthModule {}
