import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Register dto. */
export class RegisterDto {
  /** Name property. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  /** Email property. */
  @IsEmail()
  email: string;

  /** Password property. */
  @IsString()
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres' })
  @MaxLength(255)
  password: string;

  /** Workspace name property. */
  @IsString()
  @IsOptional()
  @MaxLength(255)
  workspaceName?: string;
}
