import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GoogleOAuthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  credential: string;
}
