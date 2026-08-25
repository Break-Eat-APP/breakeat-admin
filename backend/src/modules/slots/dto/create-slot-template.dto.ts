import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { SlotKind } from '@prisma/client';

/**
 * Corps de POST /venues/:venueId/slot-templates
 *
 * Décrit un créneau de récupération RÉCURRENT, rattaché à une buvette.
 * Les heures sont en minutes depuis minuit : un motif qui se rejoue chaque jour
 * n'a pas de date, et en porter une inviterait à la confusion.
 */
export class CreateSlotTemplateDto {
  @IsUUID()
  supplierId!: string;

  /** Ce que lit le client : « Immédiat », « À la mi-temps », « 17h45 ». */
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  label!: string;

  /**
   * Rôle stable du moment. Les écrans opérateur configurables ciblent ce rôle
   * plutôt qu'un identifiant de créneau, qui change chaque jour.
   */
  @IsEnum(SlotKind)
  @IsOptional()
  kind: SlotKind = SlotKind.CUSTOM;

  /** 0 = minuit, 1050 = 17h30. Borne haute à 1440 pour couvrir « jusqu'à minuit ». */
  @IsInt()
  @Min(0)
  @Max(1440)
  startMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(1440)
  endMinutes!: number;

  /** Commandes acceptées sur ce créneau. Au-delà, il passe en FULL. */
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

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
