import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsDateString,
  IsOptional,
  IsObject,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateEventDto {
  @IsUUID()
  venueId!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(150)
  name!: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  /** Initial feature flags configuration — defaults to empty object. */
  @IsObject()
  @IsOptional()
  activeFeatureFlags?: Record<string, unknown>;
}
