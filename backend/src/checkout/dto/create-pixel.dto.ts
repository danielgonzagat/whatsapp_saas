import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

enum PixelType {
  FACEBOOK = 'FACEBOOK',
  GOOGLE_ADS = 'GOOGLE_ADS',
  GOOGLE_ANALYTICS = 'GOOGLE_ANALYTICS',
  TIKTOK = 'TIKTOK',
  KWAI = 'KWAI',
  TABOOLA = 'TABOOLA',
  CUSTOM = 'CUSTOM',
}

/** Create pixel dto. */
export class CreatePixelDto {
  /** Type property. */
  @IsIn(Object.values(PixelType)) type: PixelType;
  /** Pixel id property. */
  @IsString() @MaxLength(255) pixelId: string;
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
}
