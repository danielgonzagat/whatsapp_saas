import { IsOptional, IsString, IsObject, MaxLength } from 'class-validator';

/** Update site dto. */
export class UpdateSiteDto {
  /** New site name. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  /** Content payload (JSON). */
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  /** SEO metadata (JSON). */
  @IsOptional()
  @IsObject()
  seoMeta?: Record<string, unknown>;
}
