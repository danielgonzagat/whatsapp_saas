import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** Meta ads insights query dto. Access token resolved from DB, never from client. */
export class MetaAdsInsightsQueryDto {
  /** Ad account id property. */
  @IsString()
  @MaxLength(255)
  adAccountId: string;

  /** Since property (ISO 8601 date string). */
  @IsDateString()
  since: string;

  /** Until property (ISO 8601 date string). */
  @IsDateString()
  until: string;

  /** Level property. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  level?: string;
}

/** Meta ads daily insights query dto. Access token resolved from DB, never from client. */
export class MetaAdsDailyInsightsQueryDto {
  /** Campaign id property. */
  @IsString()
  @MaxLength(255)
  campaignId: string;

  /** Since property (ISO 8601 date string). */
  @IsDateString()
  since: string;

  /** Until property (ISO 8601 date string). */
  @IsDateString()
  until: string;
}
