import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ApproveKycDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
