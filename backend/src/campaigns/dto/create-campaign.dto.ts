import { IsString, IsOptional, IsDateString } from 'class-validator';

export class CreateCampaignDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  messageTemplate?: string;

  @IsOptional()
  @IsString()
  workspaceId?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  aiStrategy?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsOptional()
  filters?: any;
}
