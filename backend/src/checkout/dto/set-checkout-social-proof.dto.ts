import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Set checkout social proof dto. */
export class SetCheckoutSocialProofDto {
  /** Social proof enabled property. */
  @IsOptional() @IsBoolean() socialProofEnabled?: boolean;
  /** Social proof alerts property (JSON string of alert configs). */
  @IsOptional() @IsString() @MaxLength(20000) socialProofAlerts?: string;
  /** Social proof custom names property. */
  @IsOptional() @IsString() @MaxLength(20000) socialProofCustomNames?: string;
}