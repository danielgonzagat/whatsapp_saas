import { IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class EnqueueEmailCampaignDto {
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  delayMs?: number;
}

export class EmailCampaignWebhookResendDto {
  @IsString()
  type: string;

  data: {
    email_id: string;
    created_at?: string;
    event?: string;
  };
}

export class EmailCampaignWebhookSendGridDto {
  @IsString()
  email: string;

  @IsString()
  event: string;

  @IsOptional()
  @IsString()
  sg_message_id?: string;

  @IsOptional()
  timestamp?: number;
}
