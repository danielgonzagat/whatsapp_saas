import { IsString, IsNumber, IsOptional } from 'class-validator';

export class CreateUpsellDto {
  @IsString() title: string;
  @IsString() headline: string;
  @IsString() description: string;
  @IsString() productName: string;
  @IsOptional() @IsString() image?: string;
  @IsNumber() priceInCents: number;
  @IsOptional() @IsNumber() compareAtPrice?: number;
  @IsOptional() @IsString() acceptBtnText?: string;
  @IsOptional() @IsString() declineBtnText?: string;
  @IsOptional() @IsNumber() timerSeconds?: number;
}
