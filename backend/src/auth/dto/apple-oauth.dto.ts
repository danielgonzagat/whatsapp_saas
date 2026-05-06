import { Type } from 'class-transformer';
import { IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

class AppleUserName {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  lastName?: string;
}

class AppleUser {
  @IsOptional()
  @ValidateNested()
  @Type(() => AppleUserName)
  name?: AppleUserName;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;
}

/** Apple o auth dto. */
export class AppleOAuthDto {
  /** Identity token property. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  identityToken?: string;

  /** Authorization code property. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  authorizationCode?: string;

  /** Redirect uri property. */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  redirectUri?: string;

  /** User property. */
  @IsOptional()
  @ValidateNested()
  @Type(() => AppleUser)
  user?: AppleUser;
}
