import { IsString, IsOptional, IsUrl, MinLength, MaxLength, Matches } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Body for PATCH /api/v1/backoffice/organizations/:id
 *
 * All fields optional — only provided fields are updated. Covers both profile
 * (name, slug) and branding (logoUrl, primaryColor, description). Slug, when
 * provided, must stay globally unique.
 *
 * Clearing a branding field: send empty string '' → transformed to null.
 */
export class UpdateBackofficeOrgDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers and hyphens',
  })
  slug?: string;

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
