import { IsOptional, IsBoolean, IsObject } from 'class-validator';
export class SetSettingsDto {
  @IsOptional() @IsBoolean() email?: boolean;
  @IsOptional() @IsBoolean() billingSuspended?: boolean;
  @IsOptional() @IsObject() autopilot?: Record<string, any>;
  @IsOptional() @IsObject() autonomy?: Record<string, any>;
}
