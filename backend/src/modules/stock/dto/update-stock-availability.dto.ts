import { IsBoolean } from 'class-validator';

/**
 * Used by OPERATOR to toggle a product's availability mid-service
 * (e.g. 86 an item that ran out, or re-enable it).
 */
export class UpdateStockAvailabilityDto {
  @IsBoolean()
  isAvailable!: boolean;
}
