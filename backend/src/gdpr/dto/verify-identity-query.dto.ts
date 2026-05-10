import { IsString } from 'class-validator';

export class VerifyIdentityQueryDto {
  @IsString()
  token: string;
}
