import { IsString, IsOptional, IsEnum, MinLength, MaxLength } from 'class-validator';
import { VenueStatus } from '@prisma/client';

export class UpdateVenueDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  address?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  timezone?: string;

  @IsEnum(VenueStatus)
  @IsOptional()
  status?: VenueStatus;
}
