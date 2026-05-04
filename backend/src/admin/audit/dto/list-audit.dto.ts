import { Type } from 'class-transformer';
import { IsDate, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** List audit query dto. */
export class ListAuditQueryDto {
  /** Admin user id property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  adminUserId?: string;

  /** Action property. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  action?: string;

  /** Entity type property. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  entityType?: string;

  /** Entity id property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  entityId?: string;

  /** From property. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  /** To property. */
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

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
  @Max(200)
  take?: number;
}
