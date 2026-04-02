import { IsOptional, IsString, IsInt, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class ReportFiltersDto {
  @IsOptional() @IsString() @MaxLength(255) startDate?: string;
  @IsOptional() @IsString() @MaxLength(255) endDate?: string;
  @IsOptional() @IsString() @MaxLength(255) product?: string;
  @IsOptional() @IsString() @MaxLength(255) status?: string;
  @IsOptional() @IsString() @MaxLength(255) paymentMethod?: string;
  @IsOptional() @IsString() @MaxLength(255) affiliateEmail?: string;
  @IsOptional() @IsString() @MaxLength(255) buyerEmail?: string;
  @IsOptional() @IsString() @MaxLength(255) utmSource?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(999999) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) perPage?: number;
}
