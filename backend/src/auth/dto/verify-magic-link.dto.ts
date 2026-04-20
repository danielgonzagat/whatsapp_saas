import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VerifyMagicLinkDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token: string;
}
