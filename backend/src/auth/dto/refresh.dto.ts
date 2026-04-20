import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Refresh dto. */
export class RefreshDto {
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  refreshToken?: string;

  /**
   * @deprecated Use `refreshToken` instead. This alias exists for backwards
   * compatibility and will be removed in a future iteration.
   */
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  refresh_token?: string;
}
