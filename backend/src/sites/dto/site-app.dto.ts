import { IsBoolean, IsObject, IsOptional } from 'class-validator';

/** Update site app integration dto. */
export class UpdateSiteAppDto {
  /** Whether the integration is enabled. */
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Integration config (JSON). */
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
