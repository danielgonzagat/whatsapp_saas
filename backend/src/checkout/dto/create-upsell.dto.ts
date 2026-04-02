import { IsString, IsNumber, IsOptional, MaxLength, Min, Max } from 'class-validator';

export class CreateUpsellDto {
  @IsString() @MaxLength(255) title: string;
  @IsString() @MaxLength(255) headline: string;
  @IsString() @MaxLength(2000) description: string;
  @IsString() @MaxLength(255) productName: string;
  @IsOptional() @IsString() @MaxLength(2048) image?: string;
  @IsNumber() @Min(0) @Max(99999999) priceInCents: number;
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) compareAtPrice?: number;
  @IsOptional() @IsString() @MaxLength(255) acceptBtnText?: string;
  @IsOptional() @IsString() @MaxLength(255) declineBtnText?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(999999) timerSeconds?: number;
}
