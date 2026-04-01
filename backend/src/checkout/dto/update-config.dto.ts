import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsArray,
  IsIn,
  ValidateNested,
} from 'class-validator';

enum CheckoutTheme {
  NOIR = 'NOIR',
  BLANC = 'BLANC',
}

export class UpdateConfigTestimonialDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() text?: string;
  @IsOptional() @Type(() => Number) @IsNumber() stars?: number;
  @IsOptional() @Type(() => Number) @IsNumber() rating?: number;
}

export class UpdateConfigTrustBadgeDto {
  @IsOptional() @IsString() label?: string;
  @IsOptional() @IsString() icon?: string;
}

export class UpdateConfigOrderBumpDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() productName?: string;
  @IsOptional() @IsString() image?: string;
  @IsOptional() @Type(() => Number) @IsNumber() price?: number;
  @IsOptional() @Type(() => Number) @IsNumber() priceInCents?: number;
  @IsOptional() @Type(() => Number) @IsNumber() compareAtPrice?: number;
  @IsOptional() @IsString() highlightColor?: string;
  @IsOptional() @IsString() checkboxLabel?: string;
  @IsOptional() @IsString() position?: string;
  @IsOptional() @Type(() => Number) @IsNumber() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateConfigUpsellDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() headline?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() productName?: string;
  @IsOptional() @IsString() image?: string;
  @IsOptional() @Type(() => Number) @IsNumber() price?: number;
  @IsOptional() @Type(() => Number) @IsNumber() priceInCents?: number;
  @IsOptional() @Type(() => Number) @IsNumber() compareAtPrice?: number;
  @IsOptional() @IsString() acceptBtnText?: string;
  @IsOptional() @IsString() declineBtnText?: string;
  @IsOptional() @Type(() => Number) @IsNumber() timerSeconds?: number;
  @IsOptional() @IsString() chargeType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateConfigPixelDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() pixelId?: string;
  @IsOptional() @IsString() accessToken?: string;
  @IsOptional() @IsBoolean() trackPageView?: boolean;
  @IsOptional() @IsBoolean() trackInitiateCheckout?: boolean;
  @IsOptional() @IsBoolean() trackAddPaymentInfo?: boolean;
  @IsOptional() @IsBoolean() trackPurchase?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateConfigDto {
  @IsOptional() @IsIn(Object.values(CheckoutTheme)) theme?: CheckoutTheme;
  @IsOptional() @IsString() accentColor?: string;
  @IsOptional() @IsString() accentColor2?: string;
  @IsOptional() @IsString() backgroundColor?: string;
  @IsOptional() @IsString() cardColor?: string;
  @IsOptional() @IsString() textColor?: string;
  @IsOptional() @IsString() mutedTextColor?: string;
  @IsOptional() @IsString() fontBody?: string;
  @IsOptional() @IsString() fontDisplay?: string;
  @IsOptional() @IsString() brandName?: string;
  @IsOptional() @IsString() brandLogo?: string;
  @IsOptional() @IsString() headerMessage?: string;
  @IsOptional() @IsString() headerSubMessage?: string;
  @IsOptional() @IsString() productImage?: string;
  @IsOptional() @IsString() productDisplayName?: string;
  @IsOptional() @IsString() btnStep1Text?: string;
  @IsOptional() @IsString() btnStep2Text?: string;
  @IsOptional() @IsString() btnFinalizeText?: string;
  @IsOptional() @IsString() btnFinalizeIcon?: string;
  @IsOptional() @IsBoolean() requireCPF?: boolean;
  @IsOptional() @IsBoolean() requirePhone?: boolean;
  @IsOptional() @IsString() phoneLabel?: string;
  @IsOptional() @IsBoolean() enableCreditCard?: boolean;
  @IsOptional() @IsBoolean() enablePix?: boolean;
  @IsOptional() @IsBoolean() enableBoleto?: boolean;
  @IsOptional() @IsBoolean() enableCoupon?: boolean;
  @IsOptional() @IsBoolean() showCouponPopup?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() couponPopupDelay?: number;
  @IsOptional() @IsString() couponPopupTitle?: string;
  @IsOptional() @IsString() couponPopupDesc?: string;
  @IsOptional() @IsString() couponPopupBtnText?: string;
  @IsOptional() @IsString() couponPopupDismiss?: string;
  @IsOptional() @IsString() autoCouponCode?: string;
  @IsOptional() @IsBoolean() enableTimer?: boolean;
  @IsOptional() @IsString() timerType?: string;
  @IsOptional() @Type(() => Number) @IsNumber() timerMinutes?: number;
  @IsOptional() @IsString() timerMessage?: string;
  @IsOptional() @IsString() timerExpiredMessage?: string;
  @IsOptional() @IsString() timerPosition?: string;
  @IsOptional() @IsBoolean() showStockCounter?: boolean;
  @IsOptional() @IsString() stockMessage?: string;
  @IsOptional() @Type(() => Number) @IsNumber() fakeStockCount?: number;
  @IsOptional() @IsBoolean() enableTestimonials?: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateConfigTestimonialDto)
  testimonials?: UpdateConfigTestimonialDto[];
  @IsOptional() @IsBoolean() enableGuarantee?: boolean;
  @IsOptional() @IsString() guaranteeTitle?: string;
  @IsOptional() @IsString() guaranteeText?: string;
  @IsOptional() @Type(() => Number) @IsNumber() guaranteeDays?: number;
  @IsOptional() @IsBoolean() enableTrustBadges?: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateConfigTrustBadgeDto)
  trustBadges?: UpdateConfigTrustBadgeDto[];
  @IsOptional() @IsString() footerText?: string;
  @IsOptional() @IsBoolean() showPaymentIcons?: boolean;
  @IsOptional() @IsBoolean() enableExitIntent?: boolean;
  @IsOptional() @IsString() exitIntentTitle?: string;
  @IsOptional() @IsString() exitIntentDescription?: string;
  @IsOptional() @IsString() exitIntentCouponCode?: string;
  @IsOptional() @IsBoolean() enableFloatingBar?: boolean;
  @IsOptional() @IsString() floatingBarMessage?: string;
  @IsOptional() @IsString() metaTitle?: string;
  @IsOptional() @IsString() metaDescription?: string;
  @IsOptional() @IsString() metaImage?: string;
  @IsOptional() @IsString() favicon?: string;
  @IsOptional() @IsString() customCSS?: string;
  @IsOptional() @IsBoolean() chatEnabled?: boolean;
  @IsOptional() @IsString() chatWelcomeMessage?: string;
  @IsOptional() @Type(() => Number) @IsNumber() chatDelay?: number;
  @IsOptional() @IsString() chatPosition?: string;
  @IsOptional() @IsString() chatColor?: string;
  @IsOptional() @IsBoolean() chatOfferDiscount?: boolean;
  @IsOptional() @IsString() chatDiscountCode?: string;
  @IsOptional() @IsString() chatSupportPhone?: string;
  @IsOptional() @IsBoolean() socialProofEnabled?: boolean;
  @IsOptional() @IsString() socialProofCustomNames?: string;
  @IsOptional() @IsBoolean() enableSteps?: boolean;
  @IsOptional() @IsString() coverImage?: string;
  @IsOptional() @IsString() secondaryImage?: string;
  @IsOptional() @IsString() sideImage?: string;
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
