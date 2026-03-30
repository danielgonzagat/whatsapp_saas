import { IsOptional, IsBoolean } from 'class-validator';
export class SetSettingsDto {
  @IsOptional() @IsBoolean() email?: boolean;
}
