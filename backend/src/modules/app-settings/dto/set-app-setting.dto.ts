import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { FlagScope } from '@prisma/client';

export class SetAppSettingDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsEnum(FlagScope)
  scope!: FlagScope;

  /**
   * UUID of the organization or event when scope ≠ GLOBAL.
   * Must be omitted when scope === GLOBAL.
   */
  @IsUUID()
  @IsOptional()
  scopeId?: string;

  /**
   * Arbitrary JSON value.
   * Examples: "hello", 42, true, { "color": "#fff" }, ["a","b"]
   */
  value!: unknown;
}
