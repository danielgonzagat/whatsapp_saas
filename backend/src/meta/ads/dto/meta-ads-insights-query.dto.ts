import { IsDateString, IsString, MaxLength } from 'class-validator';

/** Meta ads insights query dto. */
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
  @IsString()
  @MaxLength(50)
  level: string;

  /** Access token property. */
  @IsString()
  @MaxLength(4096)
  accessToken: string;
}

/** Meta ads daily insights query dto. */
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

  /** Access token property. */
  @IsString()
  @MaxLength(4096)
  accessToken: string;
}
