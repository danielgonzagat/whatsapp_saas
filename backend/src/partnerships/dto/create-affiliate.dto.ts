import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class CreateAffiliateDto {
  @IsString()
  partnerName: string;

  @IsString()
  partnerEmail: string;

  @IsOptional()
  @IsString()
  partnerPhone?: string;

  @IsString()
  type: string;

  @IsOptional()
  @IsNumber()
  commissionRate?: number;

  @IsOptional()
  @IsArray()
  productIds?: string[];
}
