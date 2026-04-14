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

export class CreateCouponDto {
  @IsString() @MaxLength(255) code: string;
  @IsIn(Object.values(DiscountType)) discountType: DiscountType;
  @IsNumber() @Min(0) @Max(99999999) discountValue: number;
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) minOrderValue?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(999999) maxUses?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(999999) maxUsesPerUser?: number;
  @IsOptional() @IsDate() @Type(() => Date) startsAt?: Date;
  @IsOptional() @IsDate() @Type(() => Date) expiresAt?: Date;
  @IsOptional() @IsArray() appliesTo?: string[];
}
