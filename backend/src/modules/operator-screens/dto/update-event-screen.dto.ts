import { IsOptional, IsInt, Min, IsBoolean } from 'class-validator';

/**
 * Updates an event↔template link: reorder the tab or enable/disable it for THIS
 * event only (the shared template is untouched).
 */
export class UpdateEventScreenDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
