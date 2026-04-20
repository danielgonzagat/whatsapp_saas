import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/** List clients query dto. */
export class ListClientsQueryDto {
  /** Search property. */
  @IsOptional()
  @IsString()
  search?: string;

  /** Kyc status property. */
  @IsOptional()
  @IsString()
  kycStatus?: string;

  /** Skip property. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  /** Take property. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  take?: number;
}
