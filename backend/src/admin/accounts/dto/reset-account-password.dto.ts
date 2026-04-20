import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Reset account password dto. */
export class ResetAccountPasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  temporaryPassword?: string;
}
