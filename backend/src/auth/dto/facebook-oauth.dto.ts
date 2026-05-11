import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Facebook o auth dto. */
export class FacebookOAuthDto {
  /** Access token property. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  accessToken: string;

  /** User id property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  userId?: string;
}
