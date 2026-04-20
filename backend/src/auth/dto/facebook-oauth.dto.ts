import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Facebook o auth dto. */
export class FacebookOAuthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  accessToken: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  userId?: string;
}
