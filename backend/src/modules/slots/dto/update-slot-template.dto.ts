import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SlotKind } from '@prisma/client';

/**
 * Corps de PATCH /venues/:venueId/slot-templates/:id
 *
 * Écrit à la main plutôt que dérivé du DTO de création : `@nestjs/mapped-types`
 * n'est pas dans le projet, et l'ajouter pour une seule classe coûterait plus
 * qu'il ne rapporte.
 *
 * `supplierId` n'y figure PAS, et c'est délibéré : déplacer un créneau type
 * d'une buvette à une autre changerait le sens des créneaux déjà engendrés — et
 * donc des commandes qui s'y rattachent. Pour changer de comptoir, on supprime
 * et on recrée ; le geste est alors explicite.
 */
export class UpdateSlotTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @IsOptional()
  label?: string;

  @IsEnum(SlotKind)
  @IsOptional()
  kind?: SlotKind;

  @IsInt()
  @Min(0)
  @Max(1440)
  @IsOptional()
  startMinutes?: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  @IsOptional()
  endMinutes?: number;

  @IsInt()
  @Min(1)
  @Max(10000)
  @IsOptional()
  capacity?: number;

  @IsInt()
  @Min(0)
  @Max(999)
  @IsOptional()
  sortOrder?: number;

  /** Désactiver arrête la génération sans toucher aux créneaux déjà produits. */
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
