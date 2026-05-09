import { IsIn, IsOptional, IsString } from 'class-validator';

const VALID_PERIODS = ['day', 'week', 'days_28', 'lifetime'] as const;
type ValidPeriod = (typeof VALID_PERIODS)[number];

const VALID_METRICS = [
  'impressions',
  'reach',
  'follower_count',
  'profile_views',
  'website_clicks',
  'email_contacts',
  'phone_call_clicks',
  'text_message_clicks',
  'get_directions_clicks',
  'online_followers',
] as const;

export class InstagramInsightsQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(VALID_PERIODS)
  period?: ValidPeriod;

  @IsOptional()
  @IsString()
  metrics?: string;
}

export { VALID_METRICS, VALID_PERIODS };
