import { IsUUID } from 'class-validator';

export class OpenSplitDto {
  @IsUUID()
  cartId!: string;
}
