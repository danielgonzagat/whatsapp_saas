import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Attach payment method dto. */
export class AttachPaymentMethodDto {
  /** Payment method id property. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  paymentMethodId: string;
}
