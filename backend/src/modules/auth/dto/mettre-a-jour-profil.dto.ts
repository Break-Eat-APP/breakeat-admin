import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/**
 * Ce qu'un client peut corriger de SON profil, et rien de plus.
 *
 * Pas l'adresse e-mail : elle identifie le compte, sert à le retrouver et à
 * rattacher une connexion Apple ou Google. La changer ici ouvrirait la porte
 * à une reprise de compte, et demande une vérification que ce projet n'a pas.
 *
 * Pas le rôle, pas le statut, pas l'appartenance à un club : ce sont des
 * décisions d'administration.
 */
export class MettreAJourProfilDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;

  /**
   * Même règle que l'inscription — sinon un numéro accepté ici serait refusé
   * là-bas, et le client n'y comprendrait rien.
   */
  @IsString()
  @IsOptional()
  @Matches(/^\+?[\d\s\-().]{7,20}$/, { message: 'Numéro de téléphone invalide' })
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  displayName?: string;
}
