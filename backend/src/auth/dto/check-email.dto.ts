import { IsEmail } from 'class-validator';

/** Check email dto. */
export class CheckEmailDto {
  @IsEmail()
  email: string;
}
