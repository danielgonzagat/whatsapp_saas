import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** Run flow dto. */
export class RunFlowDto {
  /** Flow property. */
  @IsObject()
  flow: Record<string, unknown>;

  /** Start node property. */
  @IsString()
  @MaxLength(255)
  startNode: string;

  /** User property. */
  @IsString()
  @MaxLength(255)
  user: string;

  /** Flow id property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  flowId?: string;

  /** Workspace id property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  workspaceId?: string;
}
