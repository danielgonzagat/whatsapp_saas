import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

/** Add fraud blacklist dto. */
export class AddFraudBlacklistDto {
  /** Type property. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  type?: string;

  /** Value property. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  value?: string;

  /** Reason property. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  /** Expires at property (ISO 8601 date string). */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
