import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Add bank account dto. */
export class AddBankAccountDto {
  /** Bank name property. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  /** Bank code property. */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  bankCode?: string;

  /** Agency property. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  agency?: string;

  /** Account property. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  account?: string;

  /** Pix key property. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  pixKey?: string;

  /** Pix key type property. */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  pixKeyType?: string;

  /** Holder name property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  holderName?: string;

  /** Holder document property. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  holderDocument?: string;

  /** Idempotency key property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
