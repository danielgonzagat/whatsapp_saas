import { IsBoolean, IsObject, IsOptional } from 'class-validator';
export class SetSettingsDto {
  @IsOptional() @IsBoolean() email?: boolean;
  @IsOptional() @IsBoolean() billingSuspended?: boolean;
  @IsOptional() @IsObject() autopilot?: Record<string, unknown>;
  @IsOptional() @IsObject() autonomy?: Record<string, unknown>;
}
