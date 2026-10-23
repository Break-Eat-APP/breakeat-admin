import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Ce qu'un client dit de SA commande.
 *
 * Les étoiles sont obligatoires, le commentaire ne l'est pas — et c'est
 * délibéré. Exiger un texte ferait chuter le nombre de retours à presque
 * rien : la plupart des gens veulent dire « c'était bien » en un geste, pas
 * rédiger. Le commentaire sert à ceux qui ont quelque chose à ajouter.
 */
export class NoterCommandeDto {
  /**
   * 1 à 5. Borné ici ET en base : la validation protège le message d'erreur,
   * la contrainte SQL protège la donnée.
   */
  @IsInt()
  @Min(1)
  @Max(5)
  stars!: number;

  /** 1000 caractères : c'est un retour, pas un courrier. */
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  comment?: string;
}
