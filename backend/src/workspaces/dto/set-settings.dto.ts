import { IsBoolean, IsObject, IsOptional } from 'class-validator';
/** Set settings dto. */
export class SetSettingsDto {
  /** Email property. */
  @IsOptional() @IsBoolean() email?: boolean;
  /** Billing suspended property. */
  @IsOptional() @IsBoolean() billingSuspended?: boolean;
  /** Autopilot property. */
  @IsOptional() @IsObject() autopilot?: Record<string, unknown>;
  /** Autonomy property. */
  @IsOptional() @IsObject() autonomy?: Record<string, unknown>;
}
