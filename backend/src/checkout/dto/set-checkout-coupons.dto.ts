import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Set checkout coupons dto. */
export class SetCheckoutCouponsDto {
  /** Enable coupon property. */
  @IsOptional() @IsBoolean() enableCoupon?: boolean;
  /** Show coupon popup property. */
  @IsOptional() @IsBoolean() showCouponPopup?: boolean;
  /** Coupon popup delay property. */
  @IsOptional() @IsNumber() @Min(0) @Max(999999) couponPopupDelay?: number;
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
}