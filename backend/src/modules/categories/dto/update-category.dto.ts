import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsEnum,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { CategoryStatus } from '@prisma/client';

export class UpdateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(80)
  @IsOptional()
  name?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  sortOrder?: number;

  @IsEnum(CategoryStatus)
  @IsOptional()
  status?: CategoryStatus;
}
