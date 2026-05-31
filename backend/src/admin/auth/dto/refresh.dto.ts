import { IsString, MaxLength, MinLength } from 'class-validator';

/** Admin refresh dto. */
export class AdminRefreshDto {
  /** Refresh token property. */
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  refreshToken!: string;
}
