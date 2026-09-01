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

export class CreateProductDto {
  @IsUUID()
  categoryId!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  description?: string;

  /** Price in cents. 250 = €2.50. Must be >= 0. */
  @IsInt()
  @Min(0)
  price!: number;

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

  /** ISO 8601 datetime — product only available from this time. */
  @IsISO8601()
  @IsOptional()
  availableFrom?: string;

  /** ISO 8601 datetime — product only available until this time. */
  @IsISO8601()
  @IsOptional()
  availableUntil?: string;
}
