import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsNumber,
  IsBoolean,
  IsUrl,
  Min,
  Max,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { VenueStatus, VenueOperatingMode } from '@prisma/client';

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

  /** PHASE 20 — programme de fidélité activé par le club sur ce lieu. */
  @IsBoolean()
  @IsOptional()
  loyaltyEnabled?: boolean;

  /** Points gagnés par euro dépensé (>= 1 : un taux nul rendrait le programme inopérant). */
  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  loyaltyPointsPerEuro?: number;

  /** Valeur d'un point en centimes à l'utilisation (>= 1). */
  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  loyaltyPointValueCents?: number;

  /**
   * Bascule du rythme d'exploitation. Passer à PERMANENT crée le contenant
   * s'il manque ; repasser à EVENT_BASED ne le supprime pas — des commandes y
   * sont rattachées, il devient simplement dormant.
   */
  @IsEnum(VenueOperatingMode)
  @IsOptional()
  operatingMode?: VenueOperatingMode;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  timezone?: string;

  @IsEnum(VenueStatus)
  @IsOptional()
  status?: VenueStatus;
}
