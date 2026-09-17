import { IsBoolean } from 'class-validator';

/**
 * Corps de PATCH …/products/:productId/disponibilite
 *
 * `enVente: false` = HS (retiré de la carte, sans être masqué ni archivé) ;
 * `enVente: true` = remis en vente.
 */
export class DisponibiliteProduitDto {
  @IsBoolean()
  enVente!: boolean;
}
