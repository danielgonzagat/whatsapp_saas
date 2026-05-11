import { IsEmail } from 'class-validator';

/** Forgot password dto. */
export class ForgotPasswordDto {
  /** Email property. */
  @IsEmail()
  email: string;
}
