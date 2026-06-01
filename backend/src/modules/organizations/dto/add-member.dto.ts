import { IsEnum, IsUUID } from 'class-validator';
import { OrgRole } from '../../../common/enums/role.enum';

export class AddMemberDto {
  @IsUUID()
  userId!: string;

  @IsEnum(OrgRole, { message: 'Role must be one of: ORG_ADMIN, MANAGER, OPERATOR, MARKETING' })
  role!: OrgRole;
}
