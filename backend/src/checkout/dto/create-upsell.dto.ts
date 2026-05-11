import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Create upsell dto. */
export class CreateUpsellDto {
  /** Title property. */
  @IsString() @MaxLength(255) title: string;
  /** Headline property. */
  @IsString() @MaxLength(255) headline: string;
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
  /** Accept btn text property. */
  @IsOptional() @IsString() @MaxLength(255) acceptBtnText?: string;
  /** Decline btn text property. */
  @IsOptional() @IsString() @MaxLength(255) declineBtnText?: string;
  /** Timer seconds property. */
  @IsOptional() @IsNumber() @Min(0) @Max(999999) timerSeconds?: number;
}
