import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { SlotStatus } from '@prisma/client';

export class UpdateSlotDto {
  /** Restrict slot to a specific supplier. Pass null to widen to all suppliers. */
  @IsOptional()
  @IsUUID()
  supplierId?: string;

  /** Restrict slot to a specific pickup point. Pass null to widen to all. */
  @IsOptional()
  @IsUUID()
  pickupPointId?: string;

  /** ISO-8601 datetime. Must remain before endAt. */
  @IsOptional()
  @IsDateString()
  startAt?: string;

  /** ISO-8601 datetime. Must remain after startAt. */
  @IsOptional()
  @IsDateString()
  endAt?: string;

  /** Maximum number of orders. */
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  /** Human-readable label shown to customers. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  /**
   * Explicit status override — allows an operator to manually CLOSE a slot
   * regardless of capacity, or reopen a FULL slot after load drops.
   */
  @IsOptional()
  @IsEnum(SlotStatus)
  status?: SlotStatus;
}
