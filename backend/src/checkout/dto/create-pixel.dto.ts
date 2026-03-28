import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class CreatePixelDto {
  @IsString() type: string;
  @IsString() pixelId: string;
  @IsOptional() @IsString() accessToken?: string;
  @IsOptional() @IsBoolean() trackPageView?: boolean;
  @IsOptional() @IsBoolean() trackInitiateCheckout?: boolean;
  @IsOptional() @IsBoolean() trackAddPaymentInfo?: boolean;
  @IsOptional() @IsBoolean() trackPurchase?: boolean;
}
