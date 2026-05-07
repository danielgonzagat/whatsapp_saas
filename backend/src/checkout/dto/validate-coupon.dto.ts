import { IsNotEmpty, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';

/** Validate coupon dto. */
export class ValidateCouponDto {
  /** Workspace id property. */
  @IsString() @IsNotEmpty() @MaxLength(255) workspaceId: string;
  /** Coupon code property. */
  @IsString() @IsNotEmpty() @MaxLength(255) code: string;
  /** Plan id property. */
  @IsString() @IsNotEmpty() @MaxLength(255) planId: string;
  /** Order value in cents property. */
  @IsNumber() @Min(0) @Max(99999999) orderValue: number;
}
