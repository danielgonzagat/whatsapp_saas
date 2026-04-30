import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** Analytics date range query dto. */
export class AnalyticsDateRangeQueryDto {
  /** Start date property (ISO 8601 string). */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /** End date property (ISO 8601 string). */
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

/** Analytics report query dto. */
export class AnalyticsReportQueryDto extends AnalyticsDateRangeQueryDto {
  /** Period property. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  period?: string;
}
