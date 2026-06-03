import { IsString, Length, Matches, MaxLength } from 'class-validator';

export class MfaLoginDto {
  @IsString()
  @MaxLength(2048)
  mfaToken!: string;

  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
