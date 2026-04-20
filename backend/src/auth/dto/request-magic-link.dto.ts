import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

/** Request magic link dto. */
export class RequestMagicLinkDto {
  /** Email property. */
  @IsEmail()
  @MaxLength(255)
  email: string;

  /** Redirect to property. */
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  redirectTo?: string;
}
