import { IsString, IsOptional, IsBoolean, IsIn } from 'class-validator';

enum PixelType {
  FACEBOOK = 'FACEBOOK',
  GOOGLE_ADS = 'GOOGLE_ADS',
  GOOGLE_ANALYTICS = 'GOOGLE_ANALYTICS',
  TIKTOK = 'TIKTOK',
  KWAI = 'KWAI',
  TABOOLA = 'TABOOLA',
  CUSTOM = 'CUSTOM',
}

export class CreatePixelDto {
  @IsIn(Object.values(PixelType)) type: PixelType;
  @IsString() pixelId: string;
  @IsOptional() @IsString() accessToken?: string;
  @IsOptional() @IsBoolean() trackPageView?: boolean;
  @IsOptional() @IsBoolean() trackInitiateCheckout?: boolean;
  @IsOptional() @IsBoolean() trackAddPaymentInfo?: boolean;
  @IsOptional() @IsBoolean() trackPurchase?: boolean;
}
