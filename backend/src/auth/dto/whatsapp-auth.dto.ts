import { IsString, IsNotEmpty, Matches, MaxLength } from 'class-validator';

export class SendWhatsAppCodeDto {
  @IsString()
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must be a valid phone number' })
  phone: string;
}

export class VerifyWhatsAppCodeDto {
  @IsString()
  @Matches(/^\+?\d{10,15}$/, { message: 'phone must be a valid phone number' })
  phone: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  code: string;
}
