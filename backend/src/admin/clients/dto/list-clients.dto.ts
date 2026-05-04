import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** List clients query dto. */
export class ListClientsQueryDto {
  /** Search property. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /** Kyc status property. */
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'submitted', 'approved', 'rejected', 'reverify'])
  kycStatus?: 'pending' | 'submitted' | 'approved' | 'rejected' | 'reverify';

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
