import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsEnum,
  IsUrl,
  IsISO8601,
  IsUUID,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ProductStatus } from '@prisma/client';

export class UpdateProductDto {
  /** Move product to a different category (must belong to same supplier). */
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  price?: number;

  @IsUrl()
  @IsOptional()
  imageUrl?: string;

  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @IsISO8601()
  @IsOptional()
  availableFrom?: string;

  @IsISO8601()
  @IsOptional()
  availableUntil?: string;
}
