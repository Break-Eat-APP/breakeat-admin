import { IsString, IsOptional, IsEnum, MinLength, MaxLength } from 'class-validator';
import { PickupPointStatus } from '@prisma/client';

export class UpdatePickupPointDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsEnum(PickupPointStatus)
  @IsOptional()
  status?: PickupPointStatus;
}
