import {
  IsString,
  IsNotEmpty,
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

export class CreateVenueDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  address!: string;

  /** Latitude décimale (-90..90) pour le tri par proximité dans l'app. */
  @IsNumber()
  @Min(-90)
  @Max(90)
  @IsOptional()
  latitude?: number;

  /** Longitude décimale (-180..180). */
  @IsNumber()
  @Min(-180)
  @Max(180)
  @IsOptional()
  longitude?: number;

  /** Mots-clés de recherche libres (ex. "marseille, spartiates, patinoire"). */
  @IsString()
  @IsOptional()
  @MaxLength(300)
  searchTerms?: string;

  /** Intégration Flaix : passe le relais à Flaix à la sélection du lieu. */
  @IsBoolean()
  @IsOptional()
  flaixEnabled?: boolean;

  /** Identifiant du lieu côté Flaix (pour les appels API Flaix). */
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
