import { IsEnum } from 'class-validator';
import { SupplierStatus } from '@prisma/client';

export class UpdateSupplierStatusDto {
  @IsEnum(SupplierStatus, {
    message: 'Status must be one of: OPEN, CLOSED, PAUSED, OFFLINE',
  })
  status!: SupplierStatus;
}
