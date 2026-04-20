import { IsString, Length, Matches } from 'class-validator';

/** Mfa verify dto. */
export class MfaVerifyDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
