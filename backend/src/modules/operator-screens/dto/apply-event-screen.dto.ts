import { IsUUID, IsOptional, IsInt, Min, IsBoolean } from 'class-validator';

/**
 * Applies a screen template to an event (creates an EventOperatorScreen link).
 * The template must belong to the same organisation as the event.
 */
export class ApplyEventScreenDto {
  @IsUUID('all')
  templateId!: string;

  /** Per-event tab-order override; omitted ⇒ falls back to the template's order. */
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
