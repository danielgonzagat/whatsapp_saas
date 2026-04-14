import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ReportFiltersDto {
  @IsOptional() @IsString() @MaxLength(255) startDate?: string;
  @IsOptional() @IsString() @MaxLength(255) endDate?: string;
  @IsOptional() @IsString() @MaxLength(255) product?: string;
  @IsOptional() @IsString() @MaxLength(255) status?: string;
  @IsOptional() @IsString() @MaxLength(255) paymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(255) affiliateEmail?: string;
  @IsOptional() @IsString() @MaxLength(255) buyerEmail?: string;
  @IsOptional() @IsString() @MaxLength(255) utmSource?: string;

  // ── New filter fields ──
  @IsOptional() @IsString() @MaxLength(255) orderCode?: string;
  @IsOptional() @IsString() @MaxLength(255) buyerName?: string;
  @IsOptional() @IsString() @MaxLength(30) cpfCnpj?: string;
  @IsOptional() @IsString() @MaxLength(255) planName?: string;
  @IsOptional() @IsString() @MaxLength(255) utmMedium?: string;
  @IsOptional() @IsString() @IsIn(['true', 'false', '']) isFirstPurchase?: string;
  @IsOptional() @IsString() @IsIn(['true', 'false', '']) isRecovery?: string;
  @IsOptional() @IsString() @IsIn(['true', 'false', '']) isUpsell?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(999999) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) perPage?: number;
}
