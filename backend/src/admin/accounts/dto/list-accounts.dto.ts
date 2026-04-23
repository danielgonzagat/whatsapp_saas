import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** List accounts query dto. */
export class ListAccountsQueryDto {
  /** Search property. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  /** Filter by KYC status — accepts Agent.kycStatus values: pending/submitted/approved/rejected. */
  @IsOptional()
  @IsString()
  @IsIn(['pending', 'submitted', 'approved', 'rejected'])
  kycStatus?: 'pending' | 'submitted' | 'approved' | 'rejected';

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
