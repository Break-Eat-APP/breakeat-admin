import { IsString, IsOptional, IsUUID, IsDateString, MinLength, MaxLength } from 'class-validator';

export class ScheduleNotificationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  title!: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  body?: string;

  /** ISO 8601 — date/heure d'envoi planifié. */
  @IsDateString()
  scheduledAt!: string;

  /** Si absent, broadcast à tous les utilisateurs. */
  @IsUUID()
  @IsOptional()
  orgId?: string;
}
