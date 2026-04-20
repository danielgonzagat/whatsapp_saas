import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** Run flow dto. */
export class RunFlowDto {
  @IsObject()
  flow: Record<string, unknown>;

  @IsString()
  @MaxLength(255)
  startNode: string;

  @IsString()
  @MaxLength(255)
  user: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  flowId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  workspaceId?: string;
}
