import {
  IsUUID,
  IsInt,
  IsBoolean,
  IsOptional,
  Min,
} from 'class-validator';

export class CreateStockDto {
  @IsUUID()
  productId!: string;

  @IsUUID()
  supplierId!: string;

  /** Optional: scope this stock entry to a specific pickup point. */
  @IsUUID()
  @IsOptional()
  pickupPointId?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  quantity?: number;

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean;
}
