import { IsString, IsOptional, IsNumber, IsArray, IsObject, IsIn } from 'class-validator';

enum PaymentMethod {
  CREDIT_CARD = 'CREDIT_CARD',
  PIX = 'PIX',
  BOLETO = 'BOLETO',
}

export class CreateOrderDto {
  @IsString() planId: string;
  @IsString() workspaceId: string;
  @IsString() customerName: string;
  @IsString() customerEmail: string;
  @IsOptional() @IsString() customerCPF?: string;
  @IsOptional() @IsString() customerPhone?: string;
  @IsObject() shippingAddress: any;
  @IsOptional() @IsString() shippingMethod?: string;
  @IsOptional() @IsNumber() shippingPrice?: number;
  @IsNumber() subtotalInCents: number;
  @IsOptional() @IsNumber() discountInCents?: number;
  @IsOptional() @IsNumber() bumpTotalInCents?: number;
  @IsNumber() totalInCents: number;
  @IsOptional() @IsString() couponCode?: string;
  @IsOptional() @IsNumber() couponDiscount?: number;
  @IsOptional() @IsArray() acceptedBumps?: any;
  @IsIn(Object.values(PaymentMethod)) paymentMethod: PaymentMethod;
  @IsOptional() @IsNumber() installments?: number;
  @IsOptional() @IsString() affiliateId?: string;
  @IsOptional() @IsString() utmSource?: string;
  @IsOptional() @IsString() utmMedium?: string;
  @IsOptional() @IsString() utmCampaign?: string;
  @IsOptional() @IsString() utmContent?: string;
  @IsOptional() @IsString() utmTerm?: string;
  @IsOptional() @IsString() ipAddress?: string;
  @IsOptional() @IsString() userAgent?: string;
}
