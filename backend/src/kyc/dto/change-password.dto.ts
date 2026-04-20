import { IsString, MaxLength, MinLength } from 'class-validator';

/** Change password dto. */
export class ChangePasswordDto {
  @IsString() @MaxLength(255) currentPassword: string;
  @IsString() @MinLength(8) @MaxLength(255) newPassword: string;
}
