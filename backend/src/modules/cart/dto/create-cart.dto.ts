import { IsUUID, IsOptional } from 'class-validator';

export class CreateCartDto {
  @IsUUID()
  eventId!: string;

  @IsUUID()
  supplierId!: string;

  /** Optional at cart creation, but required before checkout. */
  @IsUUID()
  @IsOptional()
  pickupPointId?: string;
}
