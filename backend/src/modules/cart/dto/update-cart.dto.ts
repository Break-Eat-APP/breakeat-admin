import { IsUUID, IsOptional } from 'class-validator';

/**
 * Used to set or change the pickup point before checkout.
 * Cannot change eventId or supplierId — create a new cart instead.
 */
export class UpdateCartDto {
  @IsUUID()
  @IsOptional()
  pickupPointId?: string;
}
