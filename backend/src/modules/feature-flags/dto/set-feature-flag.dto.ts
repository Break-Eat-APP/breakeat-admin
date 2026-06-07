import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';
import { FlagScope } from '@prisma/client';

export class SetFeatureFlagDto {
  @IsString()
  key!: string;

  @IsEnum(FlagScope)
  scope!: FlagScope;

  /**
   * UUID of the organization or event when scope ≠ GLOBAL.
   * Must be omitted (or null) when scope === GLOBAL.
   */
  @IsUUID()
  @IsOptional()
  scopeId?: string;

  @IsBoolean()
  enabled!: boolean;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
