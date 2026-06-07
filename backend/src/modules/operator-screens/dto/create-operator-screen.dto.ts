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
 * Creates a reusable operator-screen template (org-level).
 *
 * Display conditions (all optional, empty = "no restriction"):
 *  - slotKinds   : which "moment de récupération" the screen shows
 *  - statuses    : which order statuses (empty ⇒ default derived from `kind`)
 *  - supplierIds : which suppliers (empty ⇒ all suppliers active on the event)
 *  - filters     : finer JSON rules (category/product toggles, récap panel)
 *
 * `filters` is intentionally an opaque object: the global ValidationPipe whitelist
 * does not recurse into it, so its keys survive. The service sanitises it to the
 * known shape before persisting.
 */
export class CreateOperatorScreenDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

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
