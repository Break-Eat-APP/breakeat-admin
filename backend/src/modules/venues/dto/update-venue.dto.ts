import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsUrl,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
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

  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  searchTerms?: string;

  @IsBoolean()
  @IsOptional()
  flaixEnabled?: boolean;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  flaixVenueId?: string;

  /** URL de l'image du plan des buvettes (affichée dans l'app). Vide → null. */
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUrl(
    { protocols: ['http', 'https'], require_protocol: true },
    { message: 'buvettePlanUrl doit être une URL http(s) valide' },
  )
  @MaxLength(1000)
  buvettePlanUrl?: string | null;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  timezone?: string;

  @IsEnum(VenueStatus)
  @IsOptional()
  status?: VenueStatus;
}
