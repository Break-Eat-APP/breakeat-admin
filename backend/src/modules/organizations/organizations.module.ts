import { Module } from '@nestjs/common';
// Le club porte desormais SON compte Stripe : toutes ses buvettes encaissent dessus.
import { PaymentsModule } from '../payments/payments.module';
import { OrganizationsService } from './organizations.service';
import { OrganizationsController } from './organizations.controller';

@Module({
  imports: [PaymentsModule],
  providers: [OrganizationsService],
  controllers: [OrganizationsController],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
