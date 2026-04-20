import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Change subscription plan dto. */
export class ChangeSubscriptionPlanDto {
  /** New plan id property. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  newPlanId: string;
}

/** Ship order dto. */
export class ShipOrderDto {
  /** Tracking code property. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  trackingCode: string;

  /** Shipping method property. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  shippingMethod?: string;
}
