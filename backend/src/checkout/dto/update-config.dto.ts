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
  /** Name property. */
  @IsOptional() @IsString() @MaxLength(255) name?: string;
  /** Text property. */
  @IsOptional() @IsString() @MaxLength(2000) text?: string;
  /** Stars property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) stars?: number;
  /** Rating property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) rating?: number;
}

/** Update config trust badge dto. */
export class UpdateConfigTrustBadgeDto {
  /** Label property. */
  @IsOptional() @IsString() @MaxLength(255) label?: string;
  /** Icon property. */
  @IsOptional() @IsString() @MaxLength(255) icon?: string;
}

/** Update config order bump dto. */
export class UpdateConfigOrderBumpDto {
  /** Id property. */
  @IsOptional() @IsString() @MaxLength(255) id?: string;
  /** Title property. */
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  /** Description property. */
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  /** Product name property. */
  @IsOptional() @IsString() @MaxLength(255) productName?: string;
  /** Image property. */
  @IsOptional() @IsString() @MaxLength(2048) image?: string;
  /** Price property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(99999999) price?: number;
  /** Price in cents property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(99999999) priceInCents?: number;
  /** Compare at price property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(99999999) compareAtPrice?: number;
  /** Highlight color property. */
  @IsOptional() @IsString() @MaxLength(255) highlightColor?: string;
  /** Checkbox label property. */
  @IsOptional() @IsString() @MaxLength(255) checkboxLabel?: string;
  /** Position property. */
  @IsOptional() @IsString() @MaxLength(255) position?: string;
  /** Sort order property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) sortOrder?: number;
  /** Is active property. */
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Update config upsell dto. */
export class UpdateConfigUpsellDto {
  /** Id property. */
  @IsOptional() @IsString() @MaxLength(255) id?: string;
  /** Title property. */
  @IsOptional() @IsString() @MaxLength(255) title?: string;
  /** Headline property. */
  @IsOptional() @IsString() @MaxLength(255) headline?: string;
  /** Description property. */
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  /** Product name property. */
  @IsOptional() @IsString() @MaxLength(255) productName?: string;
  /** Image property. */
  @IsOptional() @IsString() @MaxLength(2048) image?: string;
  /** Price property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(99999999) price?: number;
  /** Price in cents property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(99999999) priceInCents?: number;
  /** Compare at price property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(99999999) compareAtPrice?: number;
  /** Accept btn text property. */
  @IsOptional() @IsString() @MaxLength(255) acceptBtnText?: string;
  /** Decline btn text property. */
  @IsOptional() @IsString() @MaxLength(255) declineBtnText?: string;
  /** Timer seconds property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) timerSeconds?: number;
  /** Charge type property. */
  @IsOptional() @IsString() @MaxLength(255) chargeType?: string;
  /** Sort order property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) sortOrder?: number;
  /** Is active property. */
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Update config pixel dto. */
export class UpdateConfigPixelDto {
  /** Id property. */
  @IsOptional() @IsString() @MaxLength(255) id?: string;
  /** Type property. */
  @IsOptional() @IsString() @MaxLength(255) type?: string;
  /** Pixel id property. */
  @IsOptional() @IsString() @MaxLength(255) pixelId?: string;
  /** Access token property. */
  @IsOptional() @IsString() @MaxLength(255) accessToken?: string;
  /** Track page view property. */
  @IsOptional() @IsBoolean() trackPageView?: boolean;
  /** Track initiate checkout property. */
  @IsOptional() @IsBoolean() trackInitiateCheckout?: boolean;
  /** Track add payment info property. */
  @IsOptional() @IsBoolean() trackAddPaymentInfo?: boolean;
  /** Track purchase property. */
  @IsOptional() @IsBoolean() trackPurchase?: boolean;
  /** Is active property. */
  @IsOptional() @IsBoolean() isActive?: boolean;
}

/** Update config dto. */
export class UpdateConfigDto {
  /** Theme property. */
  @IsOptional() @IsIn(Object.values(CheckoutTheme)) theme?: CheckoutTheme;
  /** Accent color property. */
  @IsOptional() @IsString() @MaxLength(255) accentColor?: string;
  /** Accent color2 property. */
  @IsOptional() @IsString() @MaxLength(255) accentColor2?: string;
  /** Background color property. */
  @IsOptional() @IsString() @MaxLength(255) backgroundColor?: string;
  /** Card color property. */
  @IsOptional() @IsString() @MaxLength(255) cardColor?: string;
  /** Text color property. */
  @IsOptional() @IsString() @MaxLength(255) textColor?: string;
  /** Muted text color property. */
  @IsOptional() @IsString() @MaxLength(255) mutedTextColor?: string;
  /** Font body property. */
  @IsOptional() @IsString() @MaxLength(255) fontBody?: string;
  /** Font display property. */
  @IsOptional() @IsString() @MaxLength(255) fontDisplay?: string;
  /** Brand name property. */
  @IsOptional() @IsString() @MaxLength(255) brandName?: string;
  /** Brand logo property. */
  @IsOptional() @IsString() @MaxLength(2048) brandLogo?: string;
  /** Header message property. */
  @IsOptional() @IsString() @MaxLength(2000) headerMessage?: string;
  /** Header sub message property. */
  @IsOptional() @IsString() @MaxLength(2000) headerSubMessage?: string;
  /** Product image property. */
  @IsOptional() @IsString() @MaxLength(2048) productImage?: string;
  /** Product display name property. */
  @IsOptional() @IsString() @MaxLength(255) productDisplayName?: string;
  /** Btn step1 text property. */
  @IsOptional() @IsString() @MaxLength(255) btnStep1Text?: string;
  /** Btn step2 text property. */
  @IsOptional() @IsString() @MaxLength(255) btnStep2Text?: string;
  /** Btn finalize text property. */
  @IsOptional() @IsString() @MaxLength(255) btnFinalizeText?: string;
  /** Btn finalize icon property. */
  @IsOptional() @IsString() @MaxLength(255) btnFinalizeIcon?: string;
  /** Require cpf property. */
  @IsOptional() @IsBoolean() requireCPF?: boolean;
  /** Require phone property. */
  @IsOptional() @IsBoolean() requirePhone?: boolean;
  /** Phone label property. */
  @IsOptional() @IsString() @MaxLength(255) phoneLabel?: string;
  /** Enable credit card property. */
  @IsOptional() @IsBoolean() enableCreditCard?: boolean;
  /** Enable pix property. */
  @IsOptional() @IsBoolean() enablePix?: boolean;
  /** Enable boleto property. */
  @IsOptional() @IsBoolean() enableBoleto?: boolean;
  /** Enable coupon property. */
  @IsOptional() @IsBoolean() enableCoupon?: boolean;
  /** Show coupon popup property. */
  @IsOptional() @IsBoolean() showCouponPopup?: boolean;
  /** Coupon popup delay property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) couponPopupDelay?: number;
  /** Coupon popup title property. */
  @IsOptional() @IsString() @MaxLength(255) couponPopupTitle?: string;
  /** Coupon popup desc property. */
  @IsOptional() @IsString() @MaxLength(2000) couponPopupDesc?: string;
  /** Coupon popup btn text property. */
  @IsOptional() @IsString() @MaxLength(255) couponPopupBtnText?: string;
  /** Coupon popup dismiss property. */
  @IsOptional() @IsString() @MaxLength(255) couponPopupDismiss?: string;
  /** Auto coupon code property. */
  @IsOptional() @IsString() @MaxLength(255) autoCouponCode?: string;
  /** Enable timer property. */
  @IsOptional() @IsBoolean() enableTimer?: boolean;
  /** Timer type property. */
  @IsOptional() @IsString() @MaxLength(255) timerType?: string;
  /** Timer minutes property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) timerMinutes?: number;
  /** Timer message property. */
  @IsOptional() @IsString() @MaxLength(2000) timerMessage?: string;
  /** Timer expired message property. */
  @IsOptional() @IsString() @MaxLength(2000) timerExpiredMessage?: string;
  /** Timer position property. */
  @IsOptional() @IsString() @MaxLength(255) timerPosition?: string;
  /** Show stock counter property. */
  @IsOptional() @IsBoolean() showStockCounter?: boolean;
  /** Stock message property. */
  @IsOptional() @IsString() @MaxLength(2000) stockMessage?: string;
  /** Fake stock count property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) fakeStockCount?: number;
  /** Shipping mode property. */
  @IsOptional() @IsString() @MaxLength(255) shippingMode?: string;
  /** Shipping origin zip property. */
  @IsOptional() @IsString() @MaxLength(255) shippingOriginZip?: string;
  /** Shipping variable min in cents property. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999999)
  shippingVariableMinInCents?: number;
  /** Shipping variable max in cents property. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999999)
  shippingVariableMaxInCents?: number;
  /** Shipping use kloel calculator property. */
  @IsOptional() @IsBoolean() shippingUseKloelCalculator?: boolean;
  /** Affiliate custom commission enabled property. */
  @IsOptional() @IsBoolean() affiliateCustomCommissionEnabled?: boolean;
  /** Affiliate custom commission type property. */
  @IsOptional() @IsString() @MaxLength(255) affiliateCustomCommissionType?: string;
  /** Affiliate custom commission amount in cents property. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(99999999)
  affiliateCustomCommissionAmountInCents?: number;
  /** Affiliate custom commission percent property. */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  affiliateCustomCommissionPercent?: number;
  /** Enable testimonials property. */
  @IsOptional() @IsBoolean() enableTestimonials?: boolean;
  /** Testimonials property. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateConfigTestimonialDto)
  testimonials?: UpdateConfigTestimonialDto[];
  /** Enable guarantee property. */
  @IsOptional() @IsBoolean() enableGuarantee?: boolean;
  /** Guarantee title property. */
  @IsOptional() @IsString() @MaxLength(255) guaranteeTitle?: string;
  /** Guarantee text property. */
  @IsOptional() @IsString() @MaxLength(2000) guaranteeText?: string;
  /** Guarantee days property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) guaranteeDays?: number;
  /** Enable trust badges property. */
  @IsOptional() @IsBoolean() enableTrustBadges?: boolean;
  /** Trust badges property. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateConfigTrustBadgeDto)
  trustBadges?: UpdateConfigTrustBadgeDto[];
  /** Footer text property. */
  @IsOptional() @IsString() @MaxLength(2000) footerText?: string;
  /** Show payment icons property. */
  @IsOptional() @IsBoolean() showPaymentIcons?: boolean;
  /** Enable exit intent property. */
  @IsOptional() @IsBoolean() enableExitIntent?: boolean;
  /** Exit intent title property. */
  @IsOptional() @IsString() @MaxLength(255) exitIntentTitle?: string;
  /** Exit intent description property. */
  @IsOptional() @IsString() @MaxLength(2000) exitIntentDescription?: string;
  /** Exit intent coupon code property. */
  @IsOptional() @IsString() @MaxLength(255) exitIntentCouponCode?: string;
  /** Enable floating bar property. */
  @IsOptional() @IsBoolean() enableFloatingBar?: boolean;
  /** Floating bar message property. */
  @IsOptional() @IsString() @MaxLength(2000) floatingBarMessage?: string;
  /** Meta title property. */
  @IsOptional() @IsString() @MaxLength(255) metaTitle?: string;
  /** Meta description property. */
  @IsOptional() @IsString() @MaxLength(2000) metaDescription?: string;
  /** Meta image property. */
  @IsOptional() @IsString() @MaxLength(2048) metaImage?: string;
  /** Favicon property. */
  @IsOptional() @IsString() @MaxLength(2048) favicon?: string;
  /** Custom css property. */
  @IsOptional() @IsString() @MaxLength(2000) customCSS?: string;
  /** Chat enabled property. */
  @IsOptional() @IsBoolean() chatEnabled?: boolean;
  /** Chat welcome message property. */
  @IsOptional() @IsString() @MaxLength(2000) chatWelcomeMessage?: string;
  /** Chat delay property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(999999) chatDelay?: number;
  /** Chat position property. */
  @IsOptional() @IsString() @MaxLength(255) chatPosition?: string;
  /** Chat color property. */
  @IsOptional() @IsString() @MaxLength(255) chatColor?: string;
  /** Chat offer discount property. */
  @IsOptional() @IsBoolean() chatOfferDiscount?: boolean;
  /** Chat discount code property. */
  @IsOptional() @IsString() @MaxLength(255) chatDiscountCode?: string;
  /** Chat support phone property. */
  @IsOptional() @IsString() @MaxLength(255) chatSupportPhone?: string;
  /** Social proof enabled property. */
  @IsOptional() @IsBoolean() socialProofEnabled?: boolean;
  /** Social proof custom names property. */
  @IsOptional() @IsString() @MaxLength(2000) socialProofCustomNames?: string;
  /** Enable steps property. */
  @IsOptional() @IsBoolean() enableSteps?: boolean;
  /** Cover image property. */
  @IsOptional() @IsString() @MaxLength(2048) coverImage?: string;
  /** Secondary image property. */
  @IsOptional() @IsString() @MaxLength(2048) secondaryImage?: string;
  /** Side image property. */
  @IsOptional() @IsString() @MaxLength(2048) sideImage?: string;
  /** Order bumps property. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateConfigOrderBumpDto)
  orderBumps?: UpdateConfigOrderBumpDto[];
  /** Upsells property. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateConfigUpsellDto)
  upsells?: UpdateConfigUpsellDto[];
  /** Pixels property. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateConfigPixelDto)
  pixels?: UpdateConfigPixelDto[];
}
