import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** Login dto. */
export class LoginDto {
  /** Email property. */
  @IsEmail()
  email: string;

  /** Password property. */
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  password: string;
}
