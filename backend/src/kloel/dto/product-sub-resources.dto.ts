import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

// ============================================
// Plans
// ============================================

export class CreatePlanDto {
  @IsString() @MaxLength(255) name: string;
  @IsOptional() @IsString() @MaxLength(255) slug?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) priceInCents?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(999999) maxInstallments?: number;
  @IsOptional() @IsBoolean() freeShipping?: boolean;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(255) slug?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) priceInCents?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(999999) maxInstallments?: number;
  @IsOptional() @IsBoolean() freeShipping?: boolean;
}

// ============================================
// Checkout Config
// ============================================

export class CreateCheckoutDto {
  @IsOptional() @IsString() @MaxLength(255) theme?: string;
  @IsOptional() @IsString() @MaxLength(2000) headerText?: string;
  @IsOptional() @IsString() @MaxLength(255) ctaText?: string;
  @IsOptional() @IsBoolean() showTimer?: boolean;
  @IsOptional() @IsBoolean() showTestimonials?: boolean;
}

export class UpdateCheckoutDto {
  @IsOptional() @IsString() @MaxLength(255) theme?: string;
  @IsOptional() @IsString() @MaxLength(2000) headerText?: string;
  @IsOptional() @IsString() @MaxLength(255) ctaText?: string;
  @IsOptional() @IsBoolean() showTimer?: boolean;
  @IsOptional() @IsBoolean() showTestimonials?: boolean;
}

// ============================================
// Coupons
// ============================================

export class CreateCouponDto {
  @IsString() @MaxLength(255) code: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPercent?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) discountFixed?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(999999) maxUses?: number;
  @IsOptional() @IsString() @MaxLength(255) expiresAt?: string;
}

export class ValidateCouponDto {
  @IsString() @MaxLength(255) code: string;
}

// ============================================
// URLs
// ============================================

export class CreateUrlDto {
  @IsOptional() @IsString() @MaxLength(2048) salesPageUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) thankyouUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) thankyouBoletoUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) thankyouPixUrl?: string;
}

export class UpdateUrlDto {
  @IsOptional() @IsString() @MaxLength(2048) salesPageUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) thankyouUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) thankyouBoletoUrl?: string;
  @IsOptional() @IsString() @MaxLength(2048) thankyouPixUrl?: string;
}

// ============================================
// AI Config
// ============================================

export class UpsertAIConfigDto {
  @IsOptional() @IsString() @MaxLength(2000) marketingArtificial?: string;
  @IsOptional() @IsString() @MaxLength(2000) brandVoice?: string;
  @IsOptional() @IsArray() objections?: string[];
}

// ============================================
// Reviews
// ============================================

export class CreateReviewDto {
  @IsString() @MaxLength(255) name: string;
  @IsOptional() @IsNumber() @Min(0) @Max(999999) rating?: number;
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

// ============================================
// Commissions
// ============================================

export class CreateCommissionDto {
  @IsOptional() @IsNumber() @Min(0) @Max(100) percentage?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) fixedAmount?: number;
  @IsOptional() @IsString() @MaxLength(255) type?: string;
}

export class UpdateCommissionDto {
  @IsOptional() @IsNumber() @Min(0) @Max(100) percentage?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) fixedAmount?: number;
  @IsOptional() @IsString() @MaxLength(255) type?: string;
}
