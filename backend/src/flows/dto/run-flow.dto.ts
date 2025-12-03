import { IsObject, IsOptional, IsString } from 'class-validator';

export class RunFlowDto {
  @IsObject()
  flow: any;

  @IsString()
  startNode: string;

  @IsString()
  user: string;

  @IsOptional()
  @IsString()
  flowId?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;
}
