import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsObject,
  IsIn,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

enum PaymentMethod {
  CREDIT_CARD = 'CREDIT_CARD',
  PIX = 'PIX',
  BOLETO = 'BOLETO',
}

export class CreateOrderDto {
  @IsString() @MaxLength(255) planId: string;
  @IsString() @MaxLength(255) workspaceId: string;
  @IsString() @MaxLength(255) customerName: string;
  @IsString() @MaxLength(255) customerEmail: string;
  @IsOptional() @IsString() @MaxLength(255) customerCPF?: string;
  @IsOptional() @IsString() @MaxLength(255) customerPhone?: string;
  @IsObject() shippingAddress: any;
  @IsOptional() @IsString() @MaxLength(255) shippingMethod?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) shippingPrice?: number;
  @IsNumber() @Min(0) @Max(99999999) subtotalInCents: number;
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) discountInCents?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) bumpTotalInCents?: number;
  @IsNumber() @Min(0) @Max(99999999) totalInCents: number;
  @IsOptional() @IsString() @MaxLength(255) couponCode?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) couponDiscount?: number;
  @IsOptional() @IsArray() acceptedBumps?: any;
  @IsIn(Object.values(PaymentMethod)) paymentMethod: PaymentMethod;
  @IsOptional() @IsNumber() @Min(0) @Max(999999) installments?: number;
  @IsOptional() @IsString() @MaxLength(255) affiliateId?: string;
  @IsOptional() @IsString() @MaxLength(255) utmSource?: string;
  @IsOptional() @IsString() @MaxLength(255) utmMedium?: string;
  @IsOptional() @IsString() @MaxLength(255) utmCampaign?: string;
  @IsOptional() @IsString() @MaxLength(255) utmContent?: string;
  @IsOptional() @IsString() @MaxLength(255) utmTerm?: string;
  @IsOptional() @IsString() @MaxLength(255) ipAddress?: string;
  @IsOptional() @IsString() @MaxLength(255) userAgent?: string;
}
