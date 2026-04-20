import { Type } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

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
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  identityToken: string;

  /** User property. */
  @IsOptional()
  @ValidateNested()
  @Type(() => AppleUser)
  user?: AppleUser;
}
