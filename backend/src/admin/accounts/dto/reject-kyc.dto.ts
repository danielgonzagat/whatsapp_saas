import { IsString, MaxLength, MinLength } from 'class-validator';

/** Reject kyc dto. */
export class RejectKycDto {
  /** Reason property. */
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
