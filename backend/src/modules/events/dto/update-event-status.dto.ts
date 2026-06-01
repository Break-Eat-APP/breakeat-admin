import { IsEnum } from 'class-validator';
import { EventStatus } from '@prisma/client';

export class UpdateEventStatusDto {
  @IsEnum(EventStatus, {
    message: 'Status must be one of: DRAFT, ACTIVE, PAUSED, ENDED, CANCELLED',
  })
  status!: EventStatus;
}
