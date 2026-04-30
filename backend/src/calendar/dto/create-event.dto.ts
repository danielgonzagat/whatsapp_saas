import { IsArray, IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** Create event dto. */
export class CreateEventDto {
  /** Summary property. */
  @IsString()
  @MaxLength(500)
  summary: string;

  /** Description property. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Start time property (ISO 8601 string). */
  @IsDateString()
  startTime: string;

  /** End time property (ISO 8601 string). */
  @IsDateString()
  endTime: string;

  /** Attendees property. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attendees?: string[];

  /** Location property. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  location?: string;
}
