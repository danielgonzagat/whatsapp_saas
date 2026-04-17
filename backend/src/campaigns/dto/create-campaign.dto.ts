import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { Prisma } from '@prisma/client';

export class CreateCampaignDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  messageTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  workspaceId?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  aiStrategy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  parentId?: string;

  @IsOptional()
  filters?: Prisma.InputJsonValue;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
