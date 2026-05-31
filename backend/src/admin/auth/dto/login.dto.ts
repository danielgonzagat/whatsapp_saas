import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

/** Admin login dto. */
export class AdminLoginDto {
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
