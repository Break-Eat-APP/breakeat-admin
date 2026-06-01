import { IsString, MinLength, MaxLength, Matches, IsOptional, IsObject } from 'class-validator';

export class CreateOrganizationDto {
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

  @IsOptional()
  @IsObject()
  settings?: Record<string, unknown>;
}
