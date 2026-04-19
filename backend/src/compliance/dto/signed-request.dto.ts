import { IsNotEmpty, IsString } from 'class-validator';

export class SignedRequestDto {
  @IsString()
  @IsNotEmpty()
  signed_request!: string;
}
