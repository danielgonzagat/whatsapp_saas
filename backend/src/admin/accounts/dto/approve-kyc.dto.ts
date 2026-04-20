import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Approve kyc dto. */
export class ApproveKycDto {
  /** Note property. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
