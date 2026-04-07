import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AttachPaymentMethodDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  paymentMethodId: string;
}
