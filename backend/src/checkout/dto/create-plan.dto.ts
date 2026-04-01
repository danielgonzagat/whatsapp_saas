import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  Min,
} from 'class-validator';

export class CreatePlanDto {
  @IsString() name: string;
  @IsString() slug: string;
  @IsNumber() @Min(1) priceInCents: number;
  @IsOptional() @IsNumber() compareAtPrice?: number;
  @IsOptional() @IsNumber() maxInstallments?: number;
  @IsOptional() @IsBoolean() installmentsFee?: boolean;
  @IsOptional() @IsNumber() quantity?: number;
  @IsOptional() @IsBoolean() freeShipping?: boolean;
  @IsOptional() @IsNumber() shippingPrice?: number;
  @IsOptional() @IsString() brandName?: string;
}
