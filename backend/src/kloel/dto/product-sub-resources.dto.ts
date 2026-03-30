import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsArray,
} from 'class-validator';

// ============================================
// Plans
// ============================================

export class CreatePlanDto {
  @IsString() name: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsNumber() priceInCents?: number;
  @IsOptional() @IsNumber() maxInstallments?: number;
  @IsOptional() @IsBoolean() freeShipping?: boolean;
}

export class UpdatePlanDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() slug?: string;
  @IsOptional() @IsNumber() priceInCents?: number;
  @IsOptional() @IsNumber() maxInstallments?: number;
  @IsOptional() @IsBoolean() freeShipping?: boolean;
}

// ============================================
// Checkout Config
// ============================================

export class CreateCheckoutDto {
  @IsOptional() @IsString() theme?: string;
  @IsOptional() @IsString() headerText?: string;
  @IsOptional() @IsString() ctaText?: string;
  @IsOptional() @IsBoolean() showTimer?: boolean;
  @IsOptional() @IsBoolean() showTestimonials?: boolean;
}

export class UpdateCheckoutDto {
  @IsOptional() @IsString() theme?: string;
  @IsOptional() @IsString() headerText?: string;
  @IsOptional() @IsString() ctaText?: string;
  @IsOptional() @IsBoolean() showTimer?: boolean;
  @IsOptional() @IsBoolean() showTestimonials?: boolean;
}

// ============================================
// Coupons
// ============================================

export class CreateCouponDto {
  @IsString() code: string;
  @IsOptional() @IsNumber() discountPercent?: number;
  @IsOptional() @IsNumber() discountFixed?: number;
  @IsOptional() @IsNumber() maxUses?: number;
  @IsOptional() @IsString() expiresAt?: string;
}

export class ValidateCouponDto {
  @IsString() code: string;
}

// ============================================
// URLs
// ============================================

export class CreateUrlDto {
  @IsOptional() @IsString() salesPageUrl?: string;
  @IsOptional() @IsString() thankyouUrl?: string;
  @IsOptional() @IsString() thankyouBoletoUrl?: string;
  @IsOptional() @IsString() thankyouPixUrl?: string;
}

export class UpdateUrlDto {
  @IsOptional() @IsString() salesPageUrl?: string;
  @IsOptional() @IsString() thankyouUrl?: string;
  @IsOptional() @IsString() thankyouBoletoUrl?: string;
  @IsOptional() @IsString() thankyouPixUrl?: string;
}

// ============================================
// AI Config
// ============================================

export class UpsertAIConfigDto {
  @IsOptional() @IsString() marketingArtificial?: string;
  @IsOptional() @IsString() brandVoice?: string;
  @IsOptional() @IsArray() objections?: string[];
}

// ============================================
// Reviews
// ============================================

export class CreateReviewDto {
  @IsString() name: string;
  @IsOptional() @IsNumber() rating?: number;
  @IsOptional() @IsString() comment?: string;
}

// ============================================
// Commissions
// ============================================

export class CreateCommissionDto {
  @IsOptional() @IsNumber() percentage?: number;
  @IsOptional() @IsNumber() fixedAmount?: number;
  @IsOptional() @IsString() type?: string;
}

export class UpdateCommissionDto {
  @IsOptional() @IsNumber() percentage?: number;
  @IsOptional() @IsNumber() fixedAmount?: number;
  @IsOptional() @IsString() type?: string;
}
