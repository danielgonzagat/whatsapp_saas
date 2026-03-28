import { IsString, IsNumber, IsOptional, IsArray } from 'class-validator';

export class CreateCouponDto {
  @IsString() code: string;
  @IsString() discountType: string;
  @IsNumber() discountValue: number;
  @IsOptional() @IsNumber() minOrderValue?: number;
  @IsOptional() @IsNumber() maxUses?: number;
  @IsOptional() @IsString() startsAt?: string;
  @IsOptional() @IsString() expiresAt?: string;
  @IsOptional() @IsArray() appliesTo?: string[];
}
