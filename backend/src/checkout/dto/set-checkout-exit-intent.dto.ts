import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Set checkout exit intent dto. */
export class SetCheckoutExitIntentDto {
  /** Enable exit intent property. */
  @IsOptional() @IsBoolean() enableExitIntent?: boolean;
  /** Exit intent title property. */
  @IsOptional() @IsString() @MaxLength(255) exitIntentTitle?: string;
  /** Exit intent description property. */
  @IsOptional() @IsString() @MaxLength(2000) exitIntentDescription?: string;
  /** Exit intent coupon code property. */
  @IsOptional() @IsString() @MaxLength(255) exitIntentCouponCode?: string;
}