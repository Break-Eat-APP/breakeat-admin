import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class ClaimUnitsDto {
  /**
   * Les unites cochees. Plafonnees : une tournee de stade ne depasse pas
   * quelques dizaines d'articles, et une liste sans borne est une porte
   * ouverte a une requete qui fait mal.
   */
  @ArrayNotEmpty()
  @ArrayMaxSize(60)
  @IsUUID('4', { each: true })
  unitIds!: string[];

  /** Prenom facultatif — sert seulement a ce que l'hote suive son ardoise. */
  @IsString()
  @IsOptional()
  @MaxLength(40)
  claimantName?: string;
}
