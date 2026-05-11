import { IsArray, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Create product dto. */
export class CreateProductDto {
  /** Name property. */
  @IsString() @MaxLength(255) name: string;
  /** Slug property. */
  @IsOptional() @IsString() @MaxLength(255) slug?: string;
  /** Description property. */
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  /** Images property. */
  @IsOptional() @IsArray() images?: string[];
  /** Weight property. */
  @IsOptional() @IsNumber() @Min(0) @Max(999999) weight?: number;
  /** Dimensions property. */
  @IsOptional() dimensions?: Record<string, number>;
  /** Sku property. */
  @IsOptional() @IsString() @MaxLength(255) sku?: string;
  /** Stock property. */
  @IsOptional() @IsNumber() @Min(0) @Max(999999) stock?: number;
  /** Category property. */
  @IsOptional() @IsString() @MaxLength(255) category?: string;
}
