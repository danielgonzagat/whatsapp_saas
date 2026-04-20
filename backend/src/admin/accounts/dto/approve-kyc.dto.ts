import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Approve kyc dto. */
export class ApproveKycDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
