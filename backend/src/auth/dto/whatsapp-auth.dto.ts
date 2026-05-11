import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

/** Send whats app code dto. */
export class SendWhatsAppCodeDto {
  /** Phone property. */
  @IsString()
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must be a valid phone number' })
  phone: string;
}

/** Verify whats app code dto. */
export class VerifyWhatsAppCodeDto {
  /** Phone property. */
  @IsString()
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must be a valid phone number' })
  phone: string;

  /** Code property. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code: string;
}
