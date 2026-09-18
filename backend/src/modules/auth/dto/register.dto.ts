import { IsEmail, IsString, MinLength, MaxLength, IsOptional, Matches } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Invalid email address' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  @MaxLength(72, { message: 'Password must not exceed 72 characters' })
  password!: string;

  /**
   * Prénom et nom, SÉPARÉS.
   *
   * Un club qui reçoit son fichier client a besoin des deux distinctement pour
   * sa base : découper un champ unique n'est jamais fiable (« Jean-Pierre De La
   * Tour » n'a pas de règle).
   *
   * Facultatifs au niveau du serveur, et c'est voulu : les inscriptions par
   * Apple ou Google passent par une autre route et ne les fournissent pas
   * toujours. C'est le formulaire de l'application qui les réclame.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName?: string;

  /**
   * Ce qu'on affiche. Reste accepté pour ne pas casser les appels existants ;
   * quand prénom et nom sont fournis, le serveur le recompose à partir d'eux.
   */
  @IsOptional()
  @IsString()
  @MinLength(2, { message: 'Display name must be at least 2 characters' })
  @MaxLength(50, { message: 'Display name must not exceed 50 characters' })
  displayName?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\+?[\d\s\-().]{7,20}$/, { message: 'Invalid phone number format' })
  phone?: string;
}
