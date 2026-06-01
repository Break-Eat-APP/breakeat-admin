import { IsUUID } from 'class-validator';

export class AttachSupplierDto {
  @IsUUID()
  supplierId!: string;
}
