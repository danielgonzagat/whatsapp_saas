import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class RunFlowDto {
  @IsObject()
  flow: any;

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
