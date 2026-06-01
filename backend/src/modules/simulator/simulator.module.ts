import { Module } from '@nestjs/common';
import { SimulatorController } from './simulator.controller';
import { SimulatorService } from './simulator.service';

/**
 * SimulatorModule — demo and rush-testing endpoints.
 *
 * Loaded unconditionally but all endpoints return 403 unless DEMO_MODE=true.
 * This approach avoids conditional module loading while keeping production safe.
 */
@Module({
  controllers: [SimulatorController],
  providers: [SimulatorService],
})
export class SimulatorModule {}
