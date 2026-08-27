import { IsString, IsOptional, MinLength, MaxLength, IsUrl, ValidateIf } from 'class-validator';

export class UpdateSupplierDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  preparationZone?: string;

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
