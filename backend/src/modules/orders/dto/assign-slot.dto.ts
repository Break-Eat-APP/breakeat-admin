import { IsUUID } from 'class-validator';

export class AssignSlotDto {
  @IsUUID()
  slotId!: string;
}
