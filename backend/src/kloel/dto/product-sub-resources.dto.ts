import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

// ============================================
// Plans
// ============================================

export class CreatePlanDto {
  /** Name property. */
  @IsString() @MaxLength(255) name: string;
  /** Slug property. */
  @IsOptional() @IsString() @MaxLength(255) slug?: string;
  /** Price in cents property. */
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) priceInCents?: number;
  /** Max installments property. */
  @IsOptional() @IsNumber() @Min(0) @Max(999999) maxInstallments?: number;
  /** Free shipping property. */
  @IsOptional() @IsBoolean() freeShipping?: boolean;
}

/** Update plan dto. */
export class UpdatePlanDto {
  /** Name property. */
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  /** Slug property. */
  @IsOptional() @IsString() @MaxLength(255) slug?: string;
  /** Price in cents property. */
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) priceInCents?: number;
  /** Max installments property. */
  @IsOptional() @IsNumber() @Min(0) @Max(999999) maxInstallments?: number;
  /** Free shipping property. */
  @IsOptional() @IsBoolean() freeShipping?: boolean;
}

// ============================================
// Checkout Config
// ============================================

export class CreateCheckoutDto {
  /** Theme property. */
  @IsOptional() @IsString() @MaxLength(255) theme?: string;
  /** Header text property. */
  @IsOptional() @IsString() @MaxLength(2000) headerText?: string;
  /** Cta text property. */
  @IsOptional() @IsString() @MaxLength(255) ctaText?: string;
  /** Show timer property. */
  @IsOptional() @IsBoolean() showTimer?: boolean;
  /** Show testimonials property. */
  @IsOptional() @IsBoolean() showTestimonials?: boolean;
}

/** Update checkout dto. */
export class UpdateCheckoutDto {
  /** Theme property. */
  @IsOptional() @IsString() @MaxLength(255) theme?: string;
  /** Header text property. */
  @IsOptional() @IsString() @MaxLength(2000) headerText?: string;
  /** Cta text property. */
  @IsOptional() @IsString() @MaxLength(255) ctaText?: string;
  /** Show timer property. */
  @IsOptional() @IsBoolean() showTimer?: boolean;
  /** Show testimonials property. */
  @IsOptional() @IsBoolean() showTestimonials?: boolean;
}

// ============================================
// Coupons
// ============================================

export class CreateCouponDto {
  /** Code property. */
  @IsString() @MaxLength(255) code: string;
  /** Discount percent property. */
  @IsOptional() @IsNumber() @Min(0) @Max(100) discountPercent?: number;
  /** Discount fixed property. */
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) discountFixed?: number;
  /** Max uses property. */
  @IsOptional() @IsNumber() @Min(0) @Max(999999) maxUses?: number;
  /** Expires at property. */
  @IsOptional() @IsString() @MaxLength(255) expiresAt?: string;
}

/** Validate coupon dto. */
export class ValidateCouponDto {
  /** Code property. */
  @IsString() @MaxLength(255) code: string;
}

// ============================================
// URLs
// ============================================

export class CreateUrlDto {
  /** Sales page url property. */
  @IsOptional() @IsString() @MaxLength(2048) salesPageUrl?: string;
  /** Thankyou url property. */
  @IsOptional() @IsString() @MaxLength(2048) thankyouUrl?: string;
  /** Thankyou boleto url property. */
  @IsOptional() @IsString() @MaxLength(2048) thankyouBoletoUrl?: string;
  /** Thankyou pix url property. */
  @IsOptional() @IsString() @MaxLength(2048) thankyouPixUrl?: string;
}

/** Update url dto. */
export class UpdateUrlDto {
  /** Sales page url property. */
  @IsOptional() @IsString() @MaxLength(2048) salesPageUrl?: string;
  /** Thankyou url property. */
  @IsOptional() @IsString() @MaxLength(2048) thankyouUrl?: string;
  /** Thankyou boleto url property. */
  @IsOptional() @IsString() @MaxLength(2048) thankyouBoletoUrl?: string;
  /** Thankyou pix url property. */
  @IsOptional() @IsString() @MaxLength(2048) thankyouPixUrl?: string;
}

// ============================================
// AI Config
// ============================================

export class UpsertAIConfigDto {
  /** Marketing artificial property. */
  @IsOptional() @IsString() @MaxLength(2000) marketingArtificial?: string;
  /** Brand voice property. */
  @IsOptional() @IsString() @MaxLength(2000) brandVoice?: string;
  /** Objections property. */
  @IsOptional() @IsArray() objections?: string[];
}

// ============================================
// Reviews
// ============================================

export class CreateReviewDto {
  /** Name property. */
  @IsString() @MaxLength(255) name: string;
  /** Rating property. */
  @IsOptional() @IsNumber() @Min(0) @Max(999999) rating?: number;
  /** Comment property. */
  @IsOptional() @IsString() @MaxLength(2000) comment?: string;
}

// ============================================
// Commissions
// ============================================

export class CreateCommissionDto {
  /** Percentage property. */
  @IsOptional() @IsNumber() @Min(0) @Max(100) percentage?: number;
  /** Fixed amount property. */
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) fixedAmount?: number;
  /** Type property. */
  @IsOptional() @IsString() @MaxLength(255) type?: string;
}

/** Update commission dto. */
export class UpdateCommissionDto {
  /** Percentage property. */
  @IsOptional() @IsNumber() @Min(0) @Max(100) percentage?: number;
  /** Fixed amount property. */
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) fixedAmount?: number;
  /** Type property. */
  @IsOptional() @IsString() @MaxLength(255) type?: string;
}
