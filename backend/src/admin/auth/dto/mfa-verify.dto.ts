import { IsString, Length, Matches } from 'class-validator';

/** Mfa verify dto. */
export class MfaVerifyDto {
  /** Code property. */
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
