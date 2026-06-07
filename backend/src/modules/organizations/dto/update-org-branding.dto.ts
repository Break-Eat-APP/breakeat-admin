import { IsString, IsOptional, IsUrl, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Body for PATCH /organizations/:id/branding
 * All fields are optional — only provided fields are updated.
 *
 * Clearing a field: send empty string '' → transformed to null → DB set to NULL.
 * Omit the field entirely to leave it unchanged.
 */
export class UpdateOrgBrandingDto {
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsUrl({}, { message: 'logoUrl doit être une URL valide (https://...)' })
  logoUrl?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'primaryColor doit être un code hex 6 chiffres (ex: #FF5500)',
  })
  primaryColor?: string | null;

  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @IsString()
  @MaxLength(2000)
  description?: string | null;
}
