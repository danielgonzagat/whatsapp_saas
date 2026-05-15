import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

/** TikTok o auth dto. */
export class TikTokOAuthDto {
  /** Authorization code property. Required when accessToken is not provided. */
  @ValidateIf((o: TikTokOAuthDto) => !o.accessToken)
  @IsNotEmpty()
  @IsString()
  @MaxLength(4096)
  code?: string;

  /** Redirect uri property. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  redirectUri?: string;

  /** Access token property. Required when code is not provided. */
  @ValidateIf((o: TikTokOAuthDto) => !o.code)
  @IsNotEmpty()
  @IsString()
  @MaxLength(4096)
  accessToken?: string;

  /** Open id property. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  openId?: string;

  /** Refresh token property. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  refreshToken?: string;

  /** Expires in seconds property. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31_536_000)
  expiresInSeconds?: number;
}
