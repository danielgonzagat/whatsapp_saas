import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Set checkout timer dto. */
export class SetCheckoutTimerDto {
  /** Enable timer property. */
  @IsOptional() @IsBoolean() enableTimer?: boolean;
  /** Timer type property. */
  @IsOptional() @IsIn(['COUNTDOWN', 'EXPIRATION', 'STOCK']) timerType?: 'COUNTDOWN' | 'EXPIRATION' | 'STOCK';
  /** Timer minutes property. */
  @IsOptional() @IsNumber() @Min(0) @Max(999999) timerMinutes?: number;
  /** Timer message property. */
  @IsOptional() @IsString() @MaxLength(2000) timerMessage?: string;
  /** Timer expired message property. */
  @IsOptional() @IsString() @MaxLength(2000) timerExpiredMessage?: string;
  /** Timer position property. */
  @IsOptional() @IsIn(['top', 'bottom', 'inline']) timerPosition?: string;
}