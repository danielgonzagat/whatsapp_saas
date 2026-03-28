import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateBumpDto {
  @IsString() title: string;
  @IsString() description: string;
  @IsString() productName: string;
  @IsOptional() @IsString() image?: string;
  @IsNumber() priceInCents: number;
  @IsOptional() @IsNumber() compareAtPrice?: number;
  @IsOptional() @IsString() checkboxLabel?: string;
}
