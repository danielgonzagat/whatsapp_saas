import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { DestructiveIntentKind } from '@prisma/client';

/** Create destructive intent dto. */
export class CreateDestructiveIntentDto {
  /** Kind property. */
  @IsEnum(DestructiveIntentKind)
  kind!: DestructiveIntentKind;

  /** Target type property. */
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  targetType!: string;

  /** Target id property. */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  targetId!: string;

  /** Reason property. */
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  /** Ttl seconds property. */
  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(900)
  ttlSeconds?: number;
}
