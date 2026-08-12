import { IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { OrgRole } from '../../../common/enums/role.enum';

/**
 * Body for POST /organizations/:id/invite
 *
 * Looks up the user by email — no userId needed from the admin.
 * supplierId is optional: required (by convention) for OPERATOR role,
 * not applicable for ORG_ADMIN / MANAGER / MARKETING.
 */
export class InviteMemberDto {
  @IsEmail({}, { message: 'Email invalide' })
  email!: string;

  @IsEnum(OrgRole, { message: 'Role doit être : ORG_ADMIN, MANAGER, OPERATOR ou MARKETING' })
  role!: OrgRole;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  /**
   * Mot de passe provisoire, quand la personne n'a pas encore de compte : il
   * est alors créé à la volée. À communiquer par un canal sûr, et à changer par
   * l'intéressé. Omis, on conserve l'ancien comportement (404 si compte absent).
   */
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'Le mot de passe provisoire doit contenir au moins 8 caractères' })
  @MaxLength(200)
  temporaryPassword?: string;
}
