import {
  IsString,
  IsOptional,
  IsDateString,
  IsObject,
  IsUrl,
  IsEnum,
  IsArray,
  IsUUID,
  Matches,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { EventVisibility } from '@prisma/client';

export class UpdateEventDto {
  @IsString()
  @IsOptional()
  @MinLength(2)
  @MaxLength(150)
  name?: string;

  @IsDateString()
  @IsOptional()
  startAt?: string;

  @IsDateString()
  @IsOptional()
  endAt?: string;

  @IsObject()
  @IsOptional()
  activeFeatureFlags?: Record<string, unknown>;

  // ── Phase 14.7 — Access & visibility ───────────────────────
  // PUBLIC = open to everyone; PRIVATE = restricted to linked groups.
  @IsEnum(EventVisibility)
  @IsOptional()
  visibility?: EventVisibility;

  /**
   * Full set of groups allowed to access this PRIVATE event. When provided,
   * it REPLACES the event's existing group links (send [] to clear them).
   * Omit to leave links unchanged. Groups must belong to the event's org.
   */
  @IsArray()
  @IsOptional()
  @IsUUID('all', { each: true })
  groupIds?: string[];

  // ── Phase 12.8 — Branding ──────────────────────────────────
  // Send '' to clear a field; omit it to leave unchanged.

  @IsString()
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUrl({}, { message: 'logoUrl doit être une URL valide' })
  logoUrl?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'primaryColor doit être un code hex 6 chiffres (ex: #FF5500)',
  })
  primaryColor?: string | null;
}
