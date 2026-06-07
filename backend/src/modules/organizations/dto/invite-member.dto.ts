import { IsEmail, IsEnum, IsOptional, IsUUID } from 'class-validator';
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
}
