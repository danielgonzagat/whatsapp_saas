import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Google o auth dto. */
export class GoogleOAuthDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4096)
  credential: string;
}
