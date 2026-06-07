import {
  IsString,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

/**
 * Domain rule, e.g. "boursorama.com". A leading "@" is tolerated and stripped
 * server-side; the value is stored lowercased. Empty string clears the rule.
 */
const DOMAIN_REGEX = /^(@?([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,})?$/;

export class CreateGroupDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

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
