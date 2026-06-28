import { IsString, IsOptional, IsUUID, MinLength, MaxLength } from 'class-validator';

export class SendNotificationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  body?: string;

  /** Si renseigné, envoie uniquement aux membres de cette organisation. */
  @IsUUID()
  @IsOptional()
  orgId?: string;
}
