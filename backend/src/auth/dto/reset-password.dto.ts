import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

/** Reset password dto. */
export class ResetPasswordDto {
  /** Token property. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  token: string;

  /** New password property. */
  @IsString()
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres' })
  @MaxLength(255)
  newPassword: string;
}
