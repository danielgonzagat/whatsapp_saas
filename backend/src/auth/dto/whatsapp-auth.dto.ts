import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** Send whats app code dto. */
export class SendWhatsAppCodeDto {
  @IsString()
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must be a valid phone number' })
  phone: string;
}

/** Verify whats app code dto. */
export class VerifyWhatsAppCodeDto {
  @IsString()
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must be a valid phone number' })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code: string;
}
