import { IsOptional, IsString, IsBoolean, IsIn, MaxLength } from 'class-validator';

export class UpdateBankDto {
  @IsString() @MaxLength(255) bankName: string;
  @IsOptional() @IsString() @MaxLength(255) bankCode?: string;
  @IsOptional() @IsString() @MaxLength(255) agency?: string;
  @IsOptional() @IsString() @MaxLength(255) account?: string;
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @IsIn(['CHECKING', 'SAVINGS', 'PAYMENT'])
  accountType?: string;
  @IsOptional() @IsString() @MaxLength(255) pixKey?: string;
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @IsIn(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'])
  pixKeyType?: string;
  @IsOptional() @IsString() @MaxLength(255) holderName?: string;
  @IsOptional() @IsString() @MaxLength(255) holderDocument?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
