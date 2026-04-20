import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Verify magic link dto. */
export class VerifyMagicLinkDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  token: string;
}
