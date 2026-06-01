import { IsUUID, IsInt, Min, Max } from 'class-validator';

export class AddCartItemDto {
  @IsUUID()
  productId!: string;

  /** Number of units to add. Capped at 100 per request to avoid abuse. */
  @IsInt()
  @Min(1)
  @Max(100)
  quantity!: number;
}
