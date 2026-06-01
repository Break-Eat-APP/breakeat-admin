import { IsEmail, IsISO31661Alpha2, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Optional fields to customise the Stripe Connect account creation.
 * All fields fall back to safe defaults: caller email + 'FR' country.
 */
export class CreateOnboardingLinkDto {
  /** Override default email (otherwise: caller's account email). */
  @IsEmail()
  @IsOptional()
  email?: string;

  /** ISO 3166-1 alpha-2 country code. Defaults to 'FR'. */
  @IsISO31661Alpha2()
  @IsOptional()
  country?: string;

  /** Business display name on the Stripe account. */
  @IsString()
  @IsOptional()
  @MaxLength(120)
  businessName?: string;
}
