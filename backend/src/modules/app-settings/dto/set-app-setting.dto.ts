import { Allow, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
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
   *
   * `@Allow()` is REQUIRED here, and is not decoration for its own sake: the
   * global pipe runs with `whitelist` + `forbidNonWhitelisted`, which strip
   * then reject any property carrying no validation decorator. Without it the
   * request fails with the opaque "property value should not exist" — on the
   * one field the endpoint exists to carry.
   *
   * No stricter decorator applies: the value is deliberately any JSON shape.
   */
  @Allow()
  value!: unknown;
}
