import { IsString, MaxLength, MinLength } from 'class-validator';

/** Kyc change password dto. */
export class KycChangePasswordDto {
  /** Current password property. */
  @IsString() @MaxLength(255) currentPassword!: string;
  /** New password property. */
  @IsString() @MinLength(8) @MaxLength(255) newPassword!: string;
}
