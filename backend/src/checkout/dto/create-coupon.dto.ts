import { Type } from 'class-transformer';
import {
  IsArray,
  IsDate,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

/** Create coupon dto. */
export class CreateCouponDto {
  /** Code property. */
  @IsString() @MaxLength(255) code: string;
  /** Discount type property. */
  @IsIn(Object.values(DiscountType)) discountType: DiscountType;
  /** Discount value property. */
  @IsNumber() @Min(0) @Max(99999999) discountValue: number;
  /** Min order value property. */
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) minOrderValue?: number;
  /** Max uses property. */
  @IsOptional() @IsNumber() @Min(0) @Max(999999) maxUses?: number;
  /** Max uses per user property. */
  @IsOptional() @IsNumber() @Min(0) @Max(999999) maxUsesPerUser?: number;
  /** Starts at property. */
  @IsOptional() @IsDate() @Type(() => Date) startsAt?: Date;
  /** Expires at property. */
  @IsOptional() @IsDate() @Type(() => Date) expiresAt?: Date;
  /** Applies to property. */
  @IsOptional() @IsArray() appliesTo?: string[];
}
