import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';

export class RequestMagicLinkDto {
  @IsEmail()
  @MaxLength(255)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  redirectTo?: string;
}
