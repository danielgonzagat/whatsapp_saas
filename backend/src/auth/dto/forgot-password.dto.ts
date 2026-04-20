import { IsEmail } from 'class-validator';

/** Forgot password dto. */
export class ForgotPasswordDto {
  @IsEmail()
  email: string;
}
