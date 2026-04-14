import { IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateBumpDto {
  @IsString() @MaxLength(255) title: string;
  @IsString() @MaxLength(2000) description: string;
  @IsString() @MaxLength(255) productName: string;
  @IsOptional() @IsString() @MaxLength(2048) image?: string;
  @IsNumber() @Min(0) @Max(99999999) priceInCents: number;
  @IsOptional() @IsNumber() @Min(0) @Max(99999999) compareAtPrice?: number;
  @IsOptional() @IsString() @MaxLength(255) checkboxLabel?: string;
}
