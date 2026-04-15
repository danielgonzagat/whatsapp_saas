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

export class CreateDestructiveIntentDto {
  @IsEnum(DestructiveIntentKind)
  kind!: DestructiveIntentKind;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  targetType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  targetId!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsInt()
  @Min(30)
  @Max(900)
  ttlSeconds?: number;
}
