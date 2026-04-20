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
  @IsIn(Object.values(PixelType)) type: PixelType;
  @IsString() @MaxLength(255) pixelId: string;
  @IsOptional() @IsString() @MaxLength(255) accessToken?: string;
  @IsOptional() @IsBoolean() trackPageView?: boolean;
  @IsOptional() @IsBoolean() trackInitiateCheckout?: boolean;
  @IsOptional() @IsBoolean() trackAddPaymentInfo?: boolean;
  @IsOptional() @IsBoolean() trackPurchase?: boolean;
}
