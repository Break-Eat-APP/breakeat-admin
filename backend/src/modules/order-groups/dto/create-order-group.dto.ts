import { IsUUID } from 'class-validator';

export class CreateOrderGroupDto {
  @IsUUID()
  eventId!: string;

  @IsUUID()
  supplierId!: string;
}
