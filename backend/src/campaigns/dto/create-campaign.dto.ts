import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';
import { Prisma } from '@prisma/client';

/** Create campaign dto. */
export class CreateCampaignDto {
  /** Name property. */
  @IsString()
  @MaxLength(255)
  name: string;

  /** Message template property. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  messageTemplate?: string;

  /** Workspace id property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  workspaceId?: string;

  /** Scheduled at property. */
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  /** Ai strategy property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  aiStrategy?: string;

  /** Parent id property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  parentId?: string;

  /** Filters property. */
  @IsOptional()
  filters?: Prisma.InputJsonValue;

  /** Idempotency key property. */
  @IsOptional()
  @IsString()
  @MaxLength(255)
  idempotencyKey?: string;
}
