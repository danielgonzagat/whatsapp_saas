import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Update webinar dto. */
export class UpdateWebinarDto {
  /** Title property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  /** Url property. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  url?: string;

  /** Date property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  date?: string;

  /** Description property. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Product id property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  productId?: string;
}
