import { IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/**
 * Corps de POST /bootstrap/super-admin.
 *
 * Sert à (re)créer l'accès principal quand plus personne ne peut se connecter.
 * L'autorisation ne vient PAS d'un JWT (par définition, on n'en a plus) mais
 * d'un secret partagé, posé en variable d'environnement par le propriétaire.
 */
export class BootstrapAdminDto {
  @IsEmail({}, { message: 'Email invalide' })
  email!: string;

  /** Même exigence que l'inscription de l'app. */
  @IsString()
  @MinLength(8, { message: 'Le mot de passe doit contenir au moins 8 caractères' })
  @MaxLength(200)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  /**
   * Rattache le compte à une organisation en tant qu'ORG_ADMIN — nécessaire
   * pour le dashboard manager (le back-office, lui, se contente du rôle global).
   * Omis : la réponse liste les organisations disponibles.
   */
  @IsOptional()
  @IsUUID()
  organizationId?: string;
}
