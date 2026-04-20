import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

enum CheckoutTheme {
  NOIR = 'NOIR',
  BLANC = 'BLANC',
}

/** Update config testimonial dto. */
export class UpdateConfigTestimonialDto {
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) text?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) stars?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) rating?: number;
}

/** Update config trust badge dto. */
export class UpdateConfigTrustBadgeDto {
  @IsOptional() @IsString() @MaxLength(255) label?: string;
  @IsOptional() @IsString() @MaxLength(255) icon?: string;
}

/** Update config order bump dto. */
export class UpdateConfigOrderBumpDto {
  @IsOptional() @IsString() @MaxLength(255) id?: string;
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(255) productName?: string;
  @IsOptional() @IsString() @MaxLength(2048) image?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(99999999) price?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(99999999) priceInCents?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(99999999) compareAtPrice?: number;
  @IsOptional() @IsString() @MaxLength(255) highlightColor?: string;
  @IsOptional() @IsString() @MaxLength(255) checkboxLabel?: string;
  @IsOptional() @IsString() @MaxLength(255) position?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Update config upsell dto. */
export class UpdateConfigUpsellDto {
  @IsOptional() @IsString() @MaxLength(255) id?: string;
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  @IsOptional() @IsString() @MaxLength(255) headline?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(255) productName?: string;
  @IsOptional() @IsString() @MaxLength(2048) image?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(99999999) price?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(99999999) priceInCents?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(99999999) compareAtPrice?: number;
  @IsOptional() @IsString() @MaxLength(255) acceptBtnText?: string;
  @IsOptional() @IsString() @MaxLength(255) declineBtnText?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) timerSeconds?: number;
  @IsOptional() @IsString() @MaxLength(255) chargeType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Update config pixel dto. */
export class UpdateConfigPixelDto {
  @IsOptional() @IsString() @MaxLength(255) id?: string;
  @IsOptional() @IsString() @MaxLength(255) type?: string;
  @IsOptional() @IsString() @MaxLength(255) pixelId?: string;
  @IsOptional() @IsString() @MaxLength(255) accessToken?: string;
  @IsOptional() @IsBoolean() trackPageView?: boolean;
  @IsOptional() @IsBoolean() trackInitiateCheckout?: boolean;
  @IsOptional() @IsBoolean() trackAddPaymentInfo?: boolean;
  @IsOptional() @IsBoolean() trackPurchase?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Update config dto. */
export class UpdateConfigDto {
  @IsOptional() @IsIn(Object.values(CheckoutTheme)) theme?: CheckoutTheme;
  @IsOptional() @IsString() @MaxLength(255) accentColor?: string;
  @IsOptional() @IsString() @MaxLength(255) accentColor2?: string;
  @IsOptional() @IsString() @MaxLength(255) backgroundColor?: string;
  @IsOptional() @IsString() @MaxLength(255) cardColor?: string;
  @IsOptional() @IsString() @MaxLength(255) textColor?: string;
  @IsOptional() @IsString() @MaxLength(255) mutedTextColor?: string;
  @IsOptional() @IsString() @MaxLength(255) fontBody?: string;
  @IsOptional() @IsString() @MaxLength(255) fontDisplay?: string;
  @IsOptional() @IsString() @MaxLength(255) brandName?: string;
  @IsOptional() @IsString() @MaxLength(2048) brandLogo?: string;
  @IsOptional() @IsString() @MaxLength(2000) headerMessage?: string;
  @IsOptional() @IsString() @MaxLength(2000) headerSubMessage?: string;
  @IsOptional() @IsString() @MaxLength(2048) productImage?: string;
  @IsOptional() @IsString() @MaxLength(255) productDisplayName?: string;
  @IsOptional() @IsString() @MaxLength(255) btnStep1Text?: string;
  @IsOptional() @IsString() @MaxLength(255) btnStep2Text?: string;
  @IsOptional() @IsString() @MaxLength(255) btnFinalizeText?: string;
  @IsOptional() @IsString() @MaxLength(255) btnFinalizeIcon?: string;
  @IsOptional() @IsBoolean() requireCPF?: boolean;
  @IsOptional() @IsBoolean() requirePhone?: boolean;
  @IsOptional() @IsString() @MaxLength(255) phoneLabel?: string;
  @IsOptional() @IsBoolean() enableCreditCard?: boolean;
  @IsOptional() @IsBoolean() enablePix?: boolean;
  @IsOptional() @IsBoolean() enableBoleto?: boolean;
  @IsOptional() @IsBoolean() enableCoupon?: boolean;
  @IsOptional() @IsBoolean() showCouponPopup?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) couponPopupDelay?: number;
  @IsOptional() @IsString() @MaxLength(255) couponPopupTitle?: string;
  @IsOptional() @IsString() @MaxLength(2000) couponPopupDesc?: string;
  @IsOptional() @IsString() @MaxLength(255) couponPopupBtnText?: string;
  @IsOptional() @IsString() @MaxLength(255) couponPopupDismiss?: string;
  @IsOptional() @IsString() @MaxLength(255) autoCouponCode?: string;
  @IsOptional() @IsBoolean() enableTimer?: boolean;
  @IsOptional() @IsString() @MaxLength(255) timerType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) timerMinutes?: number;
  @IsOptional() @IsString() @MaxLength(2000) timerMessage?: string;
  @IsOptional() @IsString() @MaxLength(2000) timerExpiredMessage?: string;
  @IsOptional() @IsString() @MaxLength(255) timerPosition?: string;
  @IsOptional() @IsBoolean() showStockCounter?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) stockMessage?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) fakeStockCount?: number;
  @IsOptional() @IsString() @MaxLength(255) shippingMode?: string;
  @IsOptional() @IsString() @MaxLength(255) shippingOriginZip?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999999)
  shippingVariableMinInCents?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999999)
  shippingVariableMaxInCents?: number;
  @IsOptional() @IsBoolean() shippingUseKloelCalculator?: boolean;
  @IsOptional() @IsBoolean() affiliateCustomCommissionEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(255) affiliateCustomCommissionType?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999999)
  affiliateCustomCommissionAmountInCents?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  affiliateCustomCommissionPercent?: number;
  @IsOptional() @IsBoolean() enableTestimonials?: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateConfigTestimonialDto)
  testimonials?: UpdateConfigTestimonialDto[];
  @IsOptional() @IsBoolean() enableGuarantee?: boolean;
  @IsOptional() @IsString() @MaxLength(255) guaranteeTitle?: string;
  @IsOptional() @IsString() @MaxLength(2000) guaranteeText?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) guaranteeDays?: number;
  @IsOptional() @IsBoolean() enableTrustBadges?: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateConfigTrustBadgeDto)
  trustBadges?: UpdateConfigTrustBadgeDto[];
  @IsOptional() @IsString() @MaxLength(2000) footerText?: string;
  @IsOptional() @IsBoolean() showPaymentIcons?: boolean;
  @IsOptional() @IsBoolean() enableExitIntent?: boolean;
  @IsOptional() @IsString() @MaxLength(255) exitIntentTitle?: string;
  @IsOptional() @IsString() @MaxLength(2000) exitIntentDescription?: string;
  @IsOptional() @IsString() @MaxLength(255) exitIntentCouponCode?: string;
  @IsOptional() @IsBoolean() enableFloatingBar?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) floatingBarMessage?: string;
  @IsOptional() @IsString() @MaxLength(255) metaTitle?: string;
  @IsOptional() @IsString() @MaxLength(2000) metaDescription?: string;
  @IsOptional() @IsString() @MaxLength(2048) metaImage?: string;
  @IsOptional() @IsString() @MaxLength(2048) favicon?: string;
  @IsOptional() @IsString() @MaxLength(2000) customCSS?: string;
  @IsOptional() @IsBoolean() chatEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) chatWelcomeMessage?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) chatDelay?: number;
  @IsOptional() @IsString() @MaxLength(255) chatPosition?: string;
  @IsOptional() @IsString() @MaxLength(255) chatColor?: string;
  @IsOptional() @IsBoolean() chatOfferDiscount?: boolean;
  @IsOptional() @IsString() @MaxLength(255) chatDiscountCode?: string;
  @IsOptional() @IsString() @MaxLength(255) chatSupportPhone?: string;
  @IsOptional() @IsBoolean() socialProofEnabled?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) socialProofCustomNames?: string;
  @IsOptional() @IsBoolean() enableSteps?: boolean;
  @IsOptional() @IsString() @MaxLength(2048) coverImage?: string;
  @IsOptional() @IsString() @MaxLength(2048) secondaryImage?: string;
  @IsOptional() @IsString() @MaxLength(2048) sideImage?: string;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateConfigOrderBumpDto)
  orderBumps?: UpdateConfigOrderBumpDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateConfigUpsellDto)
  upsells?: UpdateConfigUpsellDto[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateConfigPixelDto)
  pixels?: UpdateConfigPixelDto[];
}
