import { IsArray, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Create affiliate dto. */
export class CreateAffiliateDto {
  /** Partner name property. */
  @IsString()
  @MaxLength(255)
  partnerName: string;

  /** Partner email property. */
  @IsString()
  @MaxLength(255)
  partnerEmail: string;

  /** Partner phone property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  partnerPhone?: string;

  /** Type property. */
  @IsString()
  @MaxLength(255)
  type: string;

  /** Commission rate property. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number;

  /** Product ids property. */
  @IsOptional()
  @IsArray()
  productIds?: string[];
}
