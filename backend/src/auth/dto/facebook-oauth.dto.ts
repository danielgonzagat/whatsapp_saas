import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class FacebookOAuthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  accessToken: string;
}
