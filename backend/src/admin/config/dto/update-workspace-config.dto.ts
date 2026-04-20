import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Update workspace config dto. */
export class UpdateWorkspaceConfigDto {
  /** Custom domain property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  customDomain?: string;

  /** Guest mode property. */
  @IsOptional()
  @IsBoolean()
  guestMode?: boolean;

  /** Autopilot enabled property. */
  @IsOptional()
  @IsBoolean()
  autopilotEnabled?: boolean;

  /** Auth mode property. */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  authMode?: string;
}
