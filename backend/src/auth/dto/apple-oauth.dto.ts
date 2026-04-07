import { IsString, IsNotEmpty, IsOptional, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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

export class AppleOAuthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  identityToken: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AppleUser)
  user?: AppleUser;
}
