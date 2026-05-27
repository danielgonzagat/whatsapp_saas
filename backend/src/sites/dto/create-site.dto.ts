import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

/** Create site dto. */
export class CreateSiteDto {
  /** Site name. */
  @IsString()
  @MaxLength(255)
  name!: string;

  /** Slug — auto-generated from name if omitted. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Slug must be lowercase alphanumeric with hyphens',
  })
  slug?: string;

  /** Optional template identifier. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  template?: string;
}
