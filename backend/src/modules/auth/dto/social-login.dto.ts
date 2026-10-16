import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * Ce que l'application présente après une autorisation Apple ou Google.
 *
 * Le jeton d'identité, et rien d'autre qui compte : l'adresse et le nom que
 * l'application pourrait joindre ne sont pas crus sur parole — l'adresse est
 * lue DANS le jeton signé. Seul le nom est accepté de l'extérieur, parce
 * qu'Apple ne le transmet qu'à la toute première autorisation et jamais
 * ensuite.
 */
export class SocialLoginDto {
  @IsIn(['apple', 'google'])
  provider!: 'apple' | 'google';

  @IsString()
  @MinLength(20)
  @MaxLength(8192)
  token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  /**
   * Prénom et nom, remis par APPLE à la première autorisation.
   *
   * Séparés, et non recollés en une chaîne : c'est sous cette forme qu'Apple
   * les donne, et sous cette forme que la page de commande Flaix les attend.
   * Les recoller obligerait à les redécouper, ce qui se trompe sur
   * « Jean-Pierre De La Tour ».
   */
  @IsString()
  @IsOptional()
  @MaxLength(100)
  firstName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  lastName?: string;
}
