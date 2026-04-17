import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ResetAccountPasswordDto {
  @IsOptional()
  @IsString()
  @MaxLength(128)
  temporaryPassword?: string;
}
