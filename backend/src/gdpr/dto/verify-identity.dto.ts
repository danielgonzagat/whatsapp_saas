import { IsString } from 'class-validator';

export class VerifyIdentityDto {
  @IsString()
  token: string;
}
