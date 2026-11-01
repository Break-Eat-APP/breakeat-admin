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

/**
 * UNE LIGNE DE MATCH : son lien de commande, et de quoi remplir le calendrier.
 *
 * Tout voyage ensemble parce que tout se saisit ensemble — le club ouvre sa
 * saison et renseigne chaque rencontre d'un geste, lien, blason et affiche
 * compris. Un enregistrement par champ, c'est autant d'occasions d'en oublier
 * un, et un calendrier à moitié rempli.
 *
 * Chaque champ absent laisse la valeur en place ; `null` ou vide l'efface.
 */
export class LienCommandeFlaixDto {
  @IsUUID()
  eventId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  url?: string | null;

  /** Le nom de l'équipe adverse, tel qu'il s'écrira sous le blason. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  opponentName?: string | null;

  /** L'adresse du blason (https, voir `events/adversaire.ts`). */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  opponentLogoUrl?: string | null;

  /**
   * L'AFFICHE de l'événement — le flyer d'un concert, en portrait.
   *
   * Mêmes règles que le blason (https, pas d'identifiants : voir
   * `events/image-distante.ts`), mais un DESSIN différent dans l'app : une
   * vignette portrait au lieu d'un rond. Remplie, elle prend la place du
   * blason sur cet événement.
   *
   * `MaxLength(1000)` ici alors que le vérificateur s'arrête à 500 : cette
   * borne-là protège le serveur d'une chaîne absurde avant tout traitement,
   * l'autre rend un refus LISIBLE au club. Deux rôles, deux valeurs.
   */
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  posterUrl?: string | null;
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
