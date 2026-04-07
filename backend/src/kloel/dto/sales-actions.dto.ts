import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class ChangeSubscriptionPlanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  newPlanId: string;
}

export class ShipOrderDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  trackingCode: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingMethod?: string;
}
