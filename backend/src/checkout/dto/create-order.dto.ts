import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

enum PaymentMethod {
  CREDIT_CARD = 'CREDIT_CARD',
  PIX = 'PIX',
  BOLETO = 'BOLETO',
}

/** Create order dto. */
export class CreateOrderDto {
  /** Plan id property. */
  @IsString() @MaxLength(255) planId: string;
  /** Workspace id property. */
  @IsString() @MaxLength(255) workspaceId: string;
  /** Checkout code property. */
  @IsOptional() @IsString() @MaxLength(255) checkoutCode?: string;
  /** Captured lead id property. */
  @IsOptional() @IsString() @MaxLength(255) capturedLeadId?: string;
  /** Device fingerprint property. */
  @IsOptional() @IsString() @MaxLength(255) deviceFingerprint?: string;
  /** Customer name property. */
  @IsString() @MaxLength(255) customerName: string;
  /** Customer email property. */
  @IsString() @MaxLength(255) customerEmail: string;
  /** Customer cpf property. */
  @IsOptional() @IsString() @MaxLength(255) customerCPF?: string;
  /** Customer phone property. */
  @IsOptional() @IsString() @MaxLength(255) customerPhone?: string;
  /** Shipping address property. */
  @IsObject() shippingAddress: Record<string, unknown>;
  /** Shipping method property. */
  @IsOptional() @IsString() @MaxLength(255) shippingMethod?: string;
  /** Shipping price property. */
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) shippingPrice?: number;
  /** Order quantity property. */
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(99) orderQuantity?: number;
  /** Subtotal in cents property. */
  @IsNumber() @Min(0) @Max(99999999) subtotalInCents: number;
  /** Discount in cents property. */
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) discountInCents?: number;
  /** Bump total in cents property. */
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) bumpTotalInCents?: number;
  /** Total in cents property. */
  @IsNumber() @Min(0) @Max(99999999) totalInCents: number;
  /** Coupon code property. */
  @IsOptional() @IsString() @MaxLength(255) couponCode?: string;
  /** Coupon discount property. */
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) couponDiscount?: number;
  /** Accepted bumps property. */
  @IsOptional() @IsArray() @ArrayMaxSize(32) @IsString({ each: true }) acceptedBumps?: string[];
  /** Payment method property. */
  @IsIn(Object.values(PaymentMethod)) paymentMethod: PaymentMethod;
  /** Installments property. */
  @IsOptional() @IsNumber() @Min(0) @Max(999999) installments?: number;
  /** Affiliate id property. */
  @IsOptional() @IsString() @MaxLength(255) affiliateId?: string;
  /** Utm source property. */
  @IsOptional() @IsString() @MaxLength(255) utmSource?: string;
  /** Utm medium property. */
  @IsOptional() @IsString() @MaxLength(255) utmMedium?: string;
  /** Utm campaign property. */
  @IsOptional() @IsString() @MaxLength(255) utmCampaign?: string;
  /** Utm content property. */
  @IsOptional() @IsString() @MaxLength(255) utmContent?: string;
  /** Utm term property. */
  @IsOptional() @IsString() @MaxLength(255) utmTerm?: string;
  /** Ip address property. */
  @IsOptional() @IsString() @MaxLength(255) ipAddress?: string;
  /** User agent property. */
  @IsOptional() @IsString() @MaxLength(255) userAgent?: string;
  /** Card holder name property. */
  @IsOptional() @IsString() @MaxLength(255) cardHolderName?: string;
}
