import { IsArray, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Approve product dto. */
export class ApproveProductDto {
  /** Note property. */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  /** Checklist property. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  checklist?: string[];
}

/** Reject product dto. */
export class RejectProductDto {
  /** Reason property. */
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  /** Checklist property. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  checklist?: string[];
}
