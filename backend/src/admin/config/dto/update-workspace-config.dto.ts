import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Update workspace config dto. */
export class UpdateWorkspaceConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customDomain?: string;

  @IsOptional()
  @IsBoolean()
  guestMode?: boolean;

  @IsOptional()
  @IsBoolean()
  autopilotEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  authMode?: string;
}
