import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Corps de DELETE /backoffice/organizations/:id
 *
 * `confirmation` doit reproduire EXACTEMENT le nom du club visé — même
 * exigence que la remise à zéro, pour une opération qui va plus loin qu'elle.
 *
 * Un `DELETE` qui porte un corps est inhabituel, mais la sémantique HTTP
 * l'autorise et l'alternative serait pire : passer le nom du club dans
 * l'adresse le ferait entrer dans les journaux d'accès et l'historique du
 * navigateur.
 */
export class SupprimerOrgDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  confirmation!: string;
}
