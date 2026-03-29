import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ReportFiltersDto {
  @IsOptional() @IsString() startDate?: string;
  @IsOptional() @IsString() endDate?: string;
  @IsOptional() @IsString() product?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsString() affiliateEmail?: string;
  @IsOptional() @IsString() buyerEmail?: string;
  @IsOptional() @IsString() utmSource?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) perPage?: number;
}
