import { IsString, IsOptional, IsNumber, IsArray } from 'class-validator';

export class CreateProductDto {
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() images?: string[];
  @IsOptional() @IsNumber() weight?: number;
  @IsOptional() dimensions?: Record<string, number>;
  @IsOptional() @IsString() sku?: string;
  @IsOptional() @IsNumber() stock?: number;
  @IsOptional() @IsString() category?: string;
}
