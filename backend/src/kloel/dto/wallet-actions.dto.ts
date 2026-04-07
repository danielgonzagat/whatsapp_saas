import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class AddBankAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  bankCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  agency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  account?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  pixKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  pixKeyType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  holderName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  holderDocument?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
