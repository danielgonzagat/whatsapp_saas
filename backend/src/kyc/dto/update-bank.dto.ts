import { IsOptional, IsString, IsBoolean, IsIn } from 'class-validator';

export class UpdateBankDto {
  @IsString() bankName: string;
  @IsOptional() @IsString() bankCode?: string;
  @IsOptional() @IsString() agency?: string;
  @IsOptional() @IsString() account?: string;
  @IsOptional() @IsString() @IsIn(['CHECKING', 'SAVINGS', 'PAYMENT']) accountType?: string;
  @IsOptional() @IsString() pixKey?: string;
  @IsOptional() @IsString() @IsIn(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM']) pixKeyType?: string;
  @IsOptional() @IsString() holderName?: string;
  @IsOptional() @IsString() holderDocument?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
