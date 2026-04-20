import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Reset account password dto. */
export class ResetAccountPasswordDto {
  /** Temporary password property. */
  @IsOptional()
  @IsString()
  @MaxLength(128)
  temporaryPassword?: string;
}
