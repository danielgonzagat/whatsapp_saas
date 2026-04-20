import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** Login dto. */
export class LoginDto {
  /** Email property. */
  @IsEmail()
  @MaxLength(320)
  email!: string;

  /** Password property. */
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password!: string;
}
