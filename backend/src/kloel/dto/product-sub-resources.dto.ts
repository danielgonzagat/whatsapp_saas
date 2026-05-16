import { IsString, MaxLength } from 'class-validator';

/** Validate coupon dto. */
export class ValidateCouponDto {
  /** Code property. */
  @IsString() @MaxLength(255) code!: string;
}
