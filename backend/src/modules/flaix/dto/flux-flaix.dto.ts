import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Le lien du calendrier Flaix, pour l'aperçu (25/11/2026). */
export class ApercuFluxFlaixDto {
  @IsString()
  @MaxLength(500)
  lien!: string;
}

/** Le réglage du calendrier Flaix d'un lieu : le lien, et l'activation. */
export class ReglerFluxFlaixDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  lien?: string | null;

  @IsBoolean()
  actif!: boolean;
}
