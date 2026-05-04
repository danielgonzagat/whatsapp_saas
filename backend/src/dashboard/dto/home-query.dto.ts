import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** Home query dto. */
export class HomeQueryDto {
  /** Workspace id property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  workspaceId?: string;

  /** Period property. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  period?: string;

  /** Start date property (ISO 8601 string). */
  @IsOptional()
  @IsDateString()
  startDate?: string;

  /** End date property (ISO 8601 string). */
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
