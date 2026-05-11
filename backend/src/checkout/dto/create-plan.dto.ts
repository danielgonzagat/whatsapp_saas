import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Create plan dto. */
export class CreatePlanDto {
  /** Name property. */
  @IsString() @MaxLength(255) name: string;
  /** Slug property. */
  @IsOptional() @IsString() @MaxLength(255) slug?: string;
  /** Price in cents property. */
  @IsNumber() @Min(1) @Max(99999999) priceInCents: number;
  /** Compare at price property. */
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) compareAtPrice?: number;
  /** Max installments property. */
  @IsOptional() @IsNumber() @Min(0) @Max(999999) maxInstallments?: number;
  /** Installments fee property. */
  @IsOptional() @IsBoolean() installmentsFee?: boolean;
  /** Quantity property. */
  @IsOptional() @IsNumber() @Min(0) @Max(999999) quantity?: number;
  /** Free shipping property. */
  @IsOptional() @IsBoolean() freeShipping?: boolean;
  /** Shipping price property. */
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) shippingPrice?: number;
  /** Brand name property. */
  @IsOptional() @IsString() @MaxLength(255) brandName?: string;
}
