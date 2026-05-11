import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Create bump dto. */
export class CreateBumpDto {
  /** Title property. */
  @IsString() @MaxLength(255) title: string;
  /** Description property. */
  @IsString() @MaxLength(2000) description: string;
  /** Product name property. */
  @IsString() @MaxLength(255) productName: string;
  /** Image property. */
  @IsOptional() @IsString() @MaxLength(2048) image?: string;
  /** Price in cents property. */
  @IsNumber() @Min(0) @Max(99999999) priceInCents: number;
  /** Compare at price property. */
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) compareAtPrice?: number;
  /** Checkbox label property. */
  @IsOptional() @IsString() @MaxLength(255) checkboxLabel?: string;
}
