import { IsOptional, IsString, MaxLength } from 'class-validator';
import { EstUnTelephone } from '../../../common/decorators/est-un-telephone.decorator';

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
   * Même règle que l'inscription — et maintenant, littéralement la même.
   *
   * Les deux portaient une COPIE de l'expression, avec ce commentaire pour
   * seule garantie qu'elles resteraient identiques. Elles partagent désormais
   * la fonction qui écrit la valeur en base.
   *
   * Un champ VIDE reste accepté : c'est ainsi qu'un client retire un numéro
   * qu'il ne veut plus voir partir chez un partenaire.
   */
  @IsString()
  @IsOptional()
  @EstUnTelephone()
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  displayName?: string;
}
