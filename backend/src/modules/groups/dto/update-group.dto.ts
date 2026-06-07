import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

const DOMAIN_REGEX = /^(@?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})?$/;

/**
 * All fields optional. For `description` and `emailDomain`, passing an empty
 * string clears the value (set to NULL) — handled in the service.
 */
export class UpdateGroupDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(80)
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(280)
  description?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  @Matches(DOMAIN_REGEX, {
    message: 'emailDomain must be a valid domain like "boursorama.com"',
  })
  emailDomain?: string;
}
