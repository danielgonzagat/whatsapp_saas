import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import type { MindJson, MindPolicyOption } from './mind.types';
import { SUPPORTED_DECISION_TYPES } from './mind-decision-baselines';
import type { MindActionContext } from './mind-code-native.types';

class MindPolicyOptionDto implements MindPolicyOption {
  @IsString()
  @MaxLength(120)
  action: string;

  @IsObject()
  context: MindJson;

  @IsString()
  @MaxLength(120)
  predicate: string;
}

export class DecideDto {
  @IsString()
  @MaxLength(120)
  subject: string;

  @IsString()
  @IsIn([
    ...SUPPORTED_DECISION_TYPES,
    'message_tone',
    'offer_selection',
    'retry_interval',
    'urgency_level',
    'commercial_prompt',
  ])
  decisionType: string;

  @IsObject()
  context: MindJson;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MindPolicyOptionDto)
  options: MindPolicyOption[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  baseline?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  epsilon?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  outcomeKey?: string;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  @Max(1)
  utilityFail?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  utilitySuccess?: number;
}

export class GuardEvaluateDto {
  @IsString()
  @MaxLength(120)
  action: string;

  @IsString()
  @MaxLength(120)
  decisionType: string;

  @IsObject()
  context: MindActionContext;
}

export class ResolveDto {
  @IsString()
  @MaxLength(120)
  outcomeKey: string;

  @IsNumber()
  @Min(-1)
  @Max(1)
  outcome: number;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  @Max(1)
  baselineOutcome?: number;
}

export class AudioVsTextDto {
  @IsString()
  @MaxLength(40)
  @IsIn(['whatsapp', 'instagram', 'facebook', 'email', 'chat'])
  channel: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  audioRatio: number;
}

export class ToneDto {
  @IsString()
  @MaxLength(40)
  @IsIn(['whatsapp', 'instagram', 'facebook', 'email', 'chat'])
  channel: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  repliedRate: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  soldRate: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  segment?: string;
}

export class CouponDto {
  @IsString()
  @MaxLength(40)
  @IsIn(['under_100', '100_300', 'over_300', 'over_500', 'over_1000'])
  priceBand: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  soldRate: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  segment?: string;
}

export class AggressivenessDto {
  @IsString()
  @MaxLength(80)
  @IsIn(['whatsapp_sales', 'email_marketing', 'social_engagement'])
  domain: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  soldRate: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  repliedRate: number;

  @IsNumber()
  @Min(0)
  revenuePerSignal: number;
}

export class SimilarCasesDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  caseType?: string;

  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsString()
  @MaxLength(2000)
  text: string;
}

export class SimulateActionDto {
  @IsString()
  @MaxLength(120)
  action: string;

  @IsString()
  @MaxLength(120)
  decisionType: string;

  @IsObject()
  context: MindActionContext;
}

export class SimulateCandidateDto {
  @IsString()
  @MaxLength(120)
  action: string;

  @IsNumber()
  @Min(0)
  @Max(1)
  beliefMean: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  beliefVariance: number;
}

export class SimulateDecisionDto {
  @IsString()
  @MaxLength(120)
  decisionType: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimulateCandidateDto)
  candidates: SimulateCandidateDto[];

  @IsOptional()
  @IsString()
  @MaxLength(120)
  baseline?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  epsilon?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  utilitySuccess?: number;

  @IsOptional()
  @IsNumber()
  @Min(-1)
  @Max(1)
  utilityFail?: number;
}

export class SimulateDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimulateDecisionDto)
  decisions?: SimulateDecisionDto[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(['followup_timing', 'cart_recovery', 'coupon_offer', 'human_transfer', 'channel_choice'], {
    each: true,
  })
  recipeKeys?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SimulateActionDto)
  actions?: SimulateActionDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  lift?: number;

  @IsOptional()
  @IsNumber()
  pZScore?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  samples?: number;

  @IsOptional()
  fallbackActive?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  seed?: number;
}
