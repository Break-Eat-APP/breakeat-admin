import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MaxLength,
  IsEnum,
  IsArray,
  IsBoolean,
  IsInt,
  Min,
  IsObject,
  IsUUID,
  ArrayUnique,
} from 'class-validator';
import { OperatorScreenKind, SlotKind, OrderStatus } from '@prisma/client';

/**
 * Partial update of an operator-screen template. Every field is optional;
 * only provided fields are changed. Passing an empty array clears that
 * condition (= "no restriction").
 */
export class UpdateOperatorScreenDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsEnum(OperatorScreenKind)
  kind?: OperatorScreenKind;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  icon?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(SlotKind, { each: true })
  @ArrayUnique()
  slotKinds?: SlotKind[];

  @IsOptional()
  @IsArray()
  @IsEnum(OrderStatus, { each: true })
  @ArrayUnique()
  statuses?: OrderStatus[];

  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  @ArrayUnique()
  supplierIds?: string[];

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}
