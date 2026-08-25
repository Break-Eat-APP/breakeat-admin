import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Corps de POST /backoffice/organizations/:id/reset-data
 *
 * `confirmation` doit reproduire EXACTEMENT le nom de l'organisation visée.
 *
 * Ce n'est pas une formalité : l'opération efface commandes, paiements et
 * chiffre d'affaires sans retour possible. Un bouton seul se clique par
 * accident ou sur la mauvaise ligne ; recopier un nom oblige à regarder ce
 * qu'on vise. C'est la seule barrière entre un ménage et une perte sèche.
 */
export class ResetOrgDataDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  confirmation!: string;
}
