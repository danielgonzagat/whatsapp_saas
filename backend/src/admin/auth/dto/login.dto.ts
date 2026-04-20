import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** Login dto. */
export class LoginDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
