import { IsDateString, IsOptional } from 'class-validator';

/** List events query dto. */
export class ListEventsQueryDto {
  /** Start date property (ISO 8601 string). */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /** End date property (ISO 8601 string). */
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
