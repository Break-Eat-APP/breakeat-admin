import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * « J'ai oublié mon mot de passe. »
 *
 * L'adresse, et rien d'autre. Elle sert aussi de clé à la limite de débit
 * serrée — huit requêtes par quart d'heure, comptées par ADRESSE et non par IP
 * (`common/securite/limitation.ts`). C'est elle qui empêche d'utiliser cette
 * route comme annuaire d'adresses ayant un compte chez nous.
 */
export class DemanderReinitialisationDto {
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  email!: string;
}

/**
 * « Voici le code, et mon nouveau mot de passe. »
 *
 * L'ADRESSE EST REDEMANDÉE, et ce n'est pas une redondance : c'est elle qui
 * fait compter cette requête dans la limite serrée par adresse. Sans elle, le
 * compteur ne verrait rien et la seule barrière contre le tâtonnement serait
 * celle posée en base — qui compte les essais d'UN code, pas les demandes
 * répétées de codes neufs.
 */
export class ConfirmerReinitialisationDto {
  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  email!: string;

  /**
   * SIX CHIFFRES, et on le vérifie ici.
   *
   * Ce n'est pas de la cosmétique : sans cette règle, une saisie de mille
   * caractères serait hachée et comparée, et chaque tentative consommerait du
   * travail serveur sur une route publique.
   */
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Le code comporte six chiffres' })
  code!: string;

  /**
   * Les mêmes bornes qu'à l'inscription. Un mot de passe choisi ici doit
   * pouvoir resservir à la connexion — et une borne plus basse ferait de la
   * récupération le maillon faible du compte.
   */
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(72, { message: 'Le mot de passe ne peut pas dépasser 72 caractères' })
  nouveauMotDePasse!: string;
}
