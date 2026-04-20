import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** Login dto. */
export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  password: string;
}
