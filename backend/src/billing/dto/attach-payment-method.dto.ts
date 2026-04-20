import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Attach payment method dto. */
export class AttachPaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  paymentMethodId: string;
}
