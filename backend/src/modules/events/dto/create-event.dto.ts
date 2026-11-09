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
import { Transform } from 'class-transformer';

export class CreateEventDto {
  @IsUUID()
  venueId!: string;

  /**
   * Le nom est NETTOYÉ avant d'être validé : « Marseille vs Lens  » et le même
   * sans l'espace final seraient deux noms pour le même match, et « ␣␣ »
   * passerait la longueur minimale tout en n'affichant rien dans l'app.
   */
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Donne un nom à l’événement.' })
  @MinLength(2, { message: 'Le nom de l’événement doit faire au moins 2 caractères.' })
  @MaxLength(150, { message: 'Le nom de l’événement ne peut pas dépasser 150 caractères.' })
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
