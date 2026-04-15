import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ApproveProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class RejectProductDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}
