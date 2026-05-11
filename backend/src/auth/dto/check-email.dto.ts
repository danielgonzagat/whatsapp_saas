import { IsEmail } from 'class-validator';

/** Check email dto. */
export class CheckEmailDto {
  /** Email property. */
  @IsEmail()
  email: string;
}
