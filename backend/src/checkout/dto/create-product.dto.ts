import { IsString, IsOptional, IsNumber, IsArray, MaxLength, Min, Max } from 'class-validator';

export class CreateProductDto {
  @IsString() @MaxLength(255) name: string;
  @IsOptional() @IsString() @MaxLength(255) slug?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsArray() images?: string[];
  @IsOptional() @IsNumber() @Min(0) @Max(999999) weight?: number;
  @IsOptional() dimensions?: Record<string, number>;
  @IsOptional() @IsString() @MaxLength(255) sku?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(999999) stock?: number;
  @IsOptional() @IsString() @MaxLength(255) category?: string;
}
