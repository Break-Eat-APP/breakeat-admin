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

  /**
   * Si renseigné, envoie aux CLIENTS de ce club (a commandé OU suit un de ses
   * lieux) — plus à son équipe depuis le 21/11/2026 (BUG-2026-038).
   */
  @IsUUID()
  @IsOptional()
  orgId?: string;
}
