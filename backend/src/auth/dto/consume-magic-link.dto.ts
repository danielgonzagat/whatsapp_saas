import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ConsumeMagicLinkDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  token: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  linkToken?: string;
}
