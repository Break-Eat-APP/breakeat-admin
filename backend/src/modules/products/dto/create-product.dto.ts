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

export class CreateProductDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  /** Price in cents. 250 = €2.50. Must be >= 0. */
  @IsInt()
  @Min(0)
  price!: number;

  @IsUrl()
  @IsOptional()
  imageUrl?: string;

  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  /** ISO 8601 datetime — product only available from this time. */
  @IsISO8601()
  @IsOptional()
  availableFrom?: string;

  /** ISO 8601 datetime — product only available until this time. */
  @IsISO8601()
  @IsOptional()
  availableUntil?: string;
}
