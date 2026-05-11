import { IsString, MaxLength, MinLength } from 'class-validator';

/** Change password dto. */
export class ChangePasswordDto {
  /** Current password property. */
  @IsString() @MaxLength(255) currentPassword: string;
  /** New password property. */
  @IsString() @MinLength(8) @MaxLength(255) newPassword: string;
}
