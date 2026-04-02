import { IsString, IsOptional, IsNumber, IsArray, MaxLength, Min, Max } from 'class-validator';

export class CreateAffiliateDto {
  @IsString()
  @MaxLength(255)
  partnerName: string;

  @IsString()
  @MaxLength(255)
  partnerEmail: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  partnerPhone?: string;

  @IsString()
  @MaxLength(255)
  type: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number;

  @IsOptional()
  @IsArray()
  productIds?: string[];
}
