import {
  IsString,
  IsNotEmpty,
  IsUUID,
  IsOptional,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { PickupPointStatus } from '@prisma/client';

export class CreatePickupPointDto {
  @IsUUID()
  venueId!: string;

  @IsUUID()
  @IsOptional()
  eventId?: string;

  @IsUUID()
  @IsOptional()
  supplierId?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsEnum(PickupPointStatus)
  @IsOptional()
  status?: PickupPointStatus;
}
