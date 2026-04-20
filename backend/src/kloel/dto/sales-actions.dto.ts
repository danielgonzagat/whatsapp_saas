import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Change subscription plan dto. */
export class ChangeSubscriptionPlanDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  newPlanId: string;
}

/** Ship order dto. */
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
