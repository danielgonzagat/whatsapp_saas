import { IsOptional, IsString, MaxLength } from 'class-validator';

/** List config overview dto. */
export class ListConfigOverviewDto {
  /** Search property. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
