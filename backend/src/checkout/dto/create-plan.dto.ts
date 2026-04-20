import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Create plan dto. */
export class CreatePlanDto {
  @IsString() @MaxLength(255) name: string;
  @IsOptional() @IsString() @MaxLength(255) slug?: string;
  @IsNumber() @Min(1) @Max(99999999) priceInCents: number;
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) compareAtPrice?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(999999) maxInstallments?: number;
  @IsOptional() @IsBoolean() installmentsFee?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(999999) quantity?: number;
  @IsOptional() @IsBoolean() freeShipping?: boolean;
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) shippingPrice?: number;
  @IsOptional() @IsString() @MaxLength(255) brandName?: string;
}
