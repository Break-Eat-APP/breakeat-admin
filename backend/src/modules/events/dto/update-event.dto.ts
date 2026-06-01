import {
  IsString,
  IsOptional,
  IsDateString,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';

export class UpdateEventDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsDateString()
  @IsOptional()
  startAt?: string;

  @IsDateString()
  @IsOptional()
  endAt?: string;

  @IsObject()
  @IsOptional()
  activeFeatureFlags?: Record<string, unknown>;
}
