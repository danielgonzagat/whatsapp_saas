import { IsString, Length, Matches } from 'class-validator';

export class KycMfaCodeDto {
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
