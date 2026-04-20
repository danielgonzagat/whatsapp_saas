import { IsString, MaxLength, MinLength } from 'class-validator';

/** Refresh dto. */
export class RefreshDto {
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  refreshToken!: string;
}
