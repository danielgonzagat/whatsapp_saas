import { IsString, IsNumber, IsOptional, IsArray, IsIn, IsDate } from 'class-validator';
import { Type } from 'class-transformer';

enum DiscountType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

export class CreateCouponDto {
  @IsString() code: string;
  @IsIn(Object.values(DiscountType)) discountType: DiscountType;
  @IsNumber() discountValue: number;
  @IsOptional() @IsNumber() minOrderValue?: number;
  @IsOptional() @IsNumber() maxUses?: number;
  @IsOptional() @IsNumber() maxUsesPerUser?: number;
  @IsOptional() @IsDate() @Type(() => Date) startsAt?: Date;
  @IsOptional() @IsDate() @Type(() => Date) expiresAt?: Date;
  @IsOptional() @IsArray() appliesTo?: string[];
}
