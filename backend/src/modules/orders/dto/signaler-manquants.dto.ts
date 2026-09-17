import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class LigneManquanteDto {
  @IsUUID()
  orderItemId!: string;

  /** Combien d'unités manquent sur cette ligne. 0 = la ligne est complète. */
  @IsInt()
  @Min(0)
  @Max(999)
  missingQuantity!: number;
}

/**
 * Corps de PATCH /orders/:id/produits-manquants
 *
 * Les lignes absentes du corps ne changent pas. Remettre une ligne à 0 annule
 * une erreur de saisie : quand plus rien ne manque, le signalement disparaît.
 */
export class SignalerManquantsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LigneManquanteDto)
  lignes!: LigneManquanteDto[];

  /**
   * Retirer aussi de la carte les produits signalés manquants (statut HS).
   *
   * Vrai par défaut côté poste : si le produit manque pour ce client, il
   * manquera pour le suivant, et c'est précisément l'erreur de gestion qu'on
   * veut cesser de répéter.
   */
  @IsOptional()
  @IsBoolean()
  retirerDeLaCarte?: boolean;
}
