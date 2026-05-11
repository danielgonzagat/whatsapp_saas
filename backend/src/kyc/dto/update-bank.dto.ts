import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** Update bank dto. */
export class UpdateBankDto {
  /** Bank name property. */
  @IsString() @MaxLength(255) bankName: string;
  /** Bank code property. */
  @IsOptional() @IsString() @MaxLength(255) bankCode?: string;
  /** Agency property. */
  @IsOptional() @IsString() @MaxLength(255) agency?: string;
  /** Account property. */
  @IsOptional() @IsString() @MaxLength(255) account?: string;
  /** Account type property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @IsIn(['CHECKING', 'SAVINGS', 'PAYMENT'])
  accountType?: string;
  /** Pix key property. */
  @IsOptional() @IsString() @MaxLength(255) pixKey?: string;
  /** Pix key type property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @IsIn(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'])
  pixKeyType?: string;
  /** Holder name property. */
  @IsOptional() @IsString() @MaxLength(255) holderName?: string;
  /** Holder document property. */
  @IsOptional() @IsString() @MaxLength(255) holderDocument?: string;
  /** Is default property. */
  @IsOptional() @IsBoolean() isDefault?: boolean;
}
