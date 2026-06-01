import { IsInt, Min, Max } from 'class-validator';

export class UpdateCartItemDto {
  /** Absolute quantity (not delta). Must be >= 1. Use DELETE to remove an item. */
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}
