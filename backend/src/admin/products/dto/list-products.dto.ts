import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** List products query dto. */
export class ListProductsQueryDto {
  /** Search property. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  /** Status property. */
  @IsOptional()
  @IsString()
  @MaxLength(80)
  status?: string;

  /** Workspace id property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  workspaceId?: string;

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
