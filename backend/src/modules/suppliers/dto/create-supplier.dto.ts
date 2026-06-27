import { IsString, IsNotEmpty, IsOptional, IsBoolean, MinLength, MaxLength } from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  preparationZone?: string;

  /** Exploitant externe (food-truck, traiteur tiers…). Génère un code de parrainage. */
  @IsBoolean()
  @IsOptional()
  isExternal?: boolean;
}
