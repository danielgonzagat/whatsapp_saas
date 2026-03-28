import { IsOptional, IsString, IsBoolean, IsNumber, IsArray, IsIn } from 'class-validator';

enum CheckoutTheme {
  NOIR = 'NOIR',
  BLANC = 'BLANC',
}

export class UpdateConfigDto {
  @IsOptional() @IsIn(Object.values(CheckoutTheme)) theme?: CheckoutTheme;
  @IsOptional() @IsString() accentColor?: string;
  @IsOptional() @IsString() accentColor2?: string;
  @IsOptional() @IsString() backgroundColor?: string;
  @IsOptional() @IsString() cardColor?: string;
  @IsOptional() @IsString() textColor?: string;
  @IsOptional() @IsString() brandName?: string;
  @IsOptional() @IsString() brandLogo?: string;
  @IsOptional() @IsString() headerMessage?: string;
  @IsOptional() @IsString() headerSubMessage?: string;
  @IsOptional() @IsString() productImage?: string;
  @IsOptional() @IsString() productDisplayName?: string;
  @IsOptional() @IsString() btnStep1Text?: string;
  @IsOptional() @IsString() btnStep2Text?: string;
  @IsOptional() @IsString() btnFinalizeText?: string;
  @IsOptional() @IsBoolean() requireCPF?: boolean;
  @IsOptional() @IsBoolean() requirePhone?: boolean;
  @IsOptional() @IsBoolean() enableCreditCard?: boolean;
  @IsOptional() @IsBoolean() enablePix?: boolean;
  @IsOptional() @IsBoolean() enableBoleto?: boolean;
  @IsOptional() @IsBoolean() enableCoupon?: boolean;
  @IsOptional() @IsBoolean() showCouponPopup?: boolean;
  @IsOptional() @IsBoolean() enableTimer?: boolean;
  @IsOptional() @IsString() timerType?: string;
  @IsOptional() @IsNumber() timerMinutes?: number;
  @IsOptional() @IsBoolean() showStockCounter?: boolean;
  @IsOptional() @IsNumber() fakeStockCount?: number;
  @IsOptional() @IsBoolean() enableTestimonials?: boolean;
  @IsOptional() @IsArray() testimonials?: any[];
  @IsOptional() @IsBoolean() enableGuarantee?: boolean;
  @IsOptional() @IsString() guaranteeTitle?: string;
  @IsOptional() @IsString() guaranteeText?: string;
  @IsOptional() @IsNumber() guaranteeDays?: number;
  @IsOptional() @IsBoolean() enableTrustBadges?: boolean;
  @IsOptional() @IsBoolean() enableExitIntent?: boolean;
  @IsOptional() @IsBoolean() enableFloatingBar?: boolean;
  @IsOptional() @IsString() customCSS?: string;
  @IsOptional() @IsString() metaTitle?: string;
  @IsOptional() @IsString() metaDescription?: string;
}
