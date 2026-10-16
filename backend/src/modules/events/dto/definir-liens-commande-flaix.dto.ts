import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** Le lien de commande d'UN événement. `null` ou vide : on le retire. */
export class LienCommandeFlaixDto {
  @IsUUID()
  eventId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  url?: string | null;
}

/**
 * PLUSIEURS liens d'un coup — c'est tout l'intérêt.
 *
 * Flaix crée une adresse par événement, des mois à l'avance. Le club ouvre sa
 * saison, colle les liens de ses dix prochains matchs, et n'y revient plus.
 * Un enregistrement par match obligerait à dix allers-retours, et c'est
 * exactement le geste qu'on supprime.
 *
 * 200 au maximum : au-delà, c'est une importation, pas une saisie — et une
 * transaction de cette taille tient la base ouverte trop longtemps.
 */
export class DefinirLiensCommandeFlaixDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LienCommandeFlaixDto)
  liens!: LienCommandeFlaixDto[];
}
