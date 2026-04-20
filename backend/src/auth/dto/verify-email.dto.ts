import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Verify email dto. */
export class VerifyEmailDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1024)
  token: string;
}
