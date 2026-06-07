import { IsEmail, IsNotEmpty } from 'class-validator';

export class AddGroupMemberDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
