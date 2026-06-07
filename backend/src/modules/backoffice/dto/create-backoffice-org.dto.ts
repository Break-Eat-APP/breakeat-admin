import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

/**
 * Body for POST /api/v1/backoffice/organizations
 *
 * The SUPER_ADMIN provisions a new organisation shell from the back office.
 * Unlike the dashboard endpoint, NO membership is created for the caller — the
 * platform admin invites the real ORG_ADMIN afterwards via the org endpoints.
 */
export class CreateBackofficeOrgDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/, {
    message: 'Slug must contain only lowercase letters, numbers and hyphens',
  })
  slug!: string;
}
