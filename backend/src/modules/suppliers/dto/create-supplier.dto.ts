import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  MinLength,
  MaxLength,
  IsUrl,
  ValidateIf,
} from 'class-validator';

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

  /**
   * Plan d'acces propre a cette buvette (URL d'image hebergee).
   *
   * Chaine vide = « effacer » : le client retombe alors sur le plan du lieu.
   */
  @IsOptional()
  @ValidateIf((_o: unknown, valeur: unknown) => valeur !== null && valeur !== '')
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true },
    { message: 'planUrl doit etre une URL http(s) valide' })
  planUrl?: string | null;
}
