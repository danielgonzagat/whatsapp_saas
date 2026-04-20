import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Report filters dto. */
export class ReportFiltersDto {
  /** Start date property. */
  @IsOptional() @IsString() @MaxLength(255) startDate?: string;
  /** End date property. */
  @IsOptional() @IsString() @MaxLength(255) endDate?: string;
  /** Product property. */
  @IsOptional() @IsString() @MaxLength(255) product?: string;
  /** Status property. */
  @IsOptional() @IsString() @MaxLength(255) status?: string;
  /** Payment method property. */
  @IsOptional() @IsString() @MaxLength(255) paymentMethod?: string;
  /** Affiliate email property. */
  @IsOptional() @IsString() @MaxLength(255) affiliateEmail?: string;
  /** Buyer email property. */
  @IsOptional() @IsString() @MaxLength(255) buyerEmail?: string;
  /** Utm source property. */
  @IsOptional() @IsString() @MaxLength(255) utmSource?: string;

  // ── New filter fields ──
  @IsOptional() @IsString() @MaxLength(255) orderCode?: string;
  /** Buyer name property. */
  @IsOptional() @IsString() @MaxLength(255) buyerName?: string;
  /** Cpf cnpj property. */
  @IsOptional() @IsString() @MaxLength(30) cpfCnpj?: string;
  /** Plan name property. */
  @IsOptional() @IsString() @MaxLength(255) planName?: string;
  /** Utm medium property. */
  @IsOptional() @IsString() @MaxLength(255) utmMedium?: string;
  /** Is first purchase property. */
  @IsOptional() @IsString() @IsIn(['true', 'false', '']) isFirstPurchase?: string;
  /** Is recovery property. */
  @IsOptional() @IsString() @IsIn(['true', 'false', '']) isRecovery?: string;
  /** Is upsell property. */
  @IsOptional() @IsString() @IsIn(['true', 'false', '']) isUpsell?: string;

  /** Page property. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(999999) page?: number;
  /** Per page property. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) perPage?: number;
}
