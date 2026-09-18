import { IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import { TYPES_VISITE, type TypeVisite } from '../frequentation.service';

/**
 * Une visite signalée par l'application.
 *
 * Rien d'identifiant n'est accepté ici en dehors de la clé d'installation :
 * pas de nom, pas d'adresse, pas de position. Le club auquel la visite se
 * rattache est DÉDUIT du lieu ou de l'événement, côté serveur — l'application
 * ne peut donc pas attribuer des visites à un club qui n'est pas concerné.
 */
export class SignalerVisiteDto {
  /**
   * Identifiant d'installation, tiré au sort par l'application.
   *
   * Borné : un champ libre sans limite serait une invitation à écrire dans la
   * base. La longueur couvre largement un UUID.
   */
  @IsString()
  @Length(8, 64)
  visitorKey!: string;

  @IsIn(TYPES_VISITE)
  kind!: TypeVisite;

  @IsOptional()
  @IsUUID()
  venueId?: string;

  @IsOptional()
  @IsUUID()
  eventId?: string;
}
