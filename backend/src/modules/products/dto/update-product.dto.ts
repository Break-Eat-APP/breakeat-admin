import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsEnum,
  IsUrl,
  IsISO8601,
  IsUUID,
  IsIn,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ProductStatus } from '@prisma/client';
import { TAUX_TVA } from '../../../common/helpers/tva';

export class UpdateProductDto {
  /** Move product to a different category (must belong to same supplier). */
  @IsUUID()
  @IsOptional()
  categoryId?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  price?: number;

  /**
   * Taux de TVA en points de base : 550 (5,5 %), 1000 (10 %) ou 2000 (20 %).
   * Omis, le produit prend 10 % — la consommation immédiate, cas ordinaire
   * d'une buvette. Voir `common/helpers/tva.ts` pour le choix du taux.
   */
  @IsIn(TAUX_TVA as unknown as number[], {
    message: 'Le taux de TVA doit être 550 (5,5 %), 1000 (10 %) ou 2000 (20 %).',
  })
  @IsOptional()
  vatRateBps?: number;

  @IsUrl()
  @IsOptional()
  imageUrl?: string;

  @IsEnum(ProductStatus)
  @IsOptional()
  status?: ProductStatus;

  @IsISO8601()
  @IsOptional()
  availableFrom?: string;

  @IsISO8601()
  @IsOptional()
  availableUntil?: string;
}
