import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSlotDto {
  /** UUID of the supplier this slot is scoped to. Omit for event-wide slot. */
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  /** UUID of the pickup point this slot is scoped to. Omit for all pickup points. */
  @IsOptional()
  @IsUUID()
  pickupPointId?: string;

  /** ISO-8601 datetime for when the slot window opens. */
  @IsDateString()
  startAt!: string;

  /** ISO-8601 datetime for when the slot window closes. Must be after startAt. */
  @IsDateString()
  endAt!: string;

  /** Maximum number of orders that can be assigned to this slot. */
  @IsInt()
  @Min(1)
  capacity!: number;

  /** Human-readable label shown to customers (e.g. "12:00–12:15"). */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;
}
