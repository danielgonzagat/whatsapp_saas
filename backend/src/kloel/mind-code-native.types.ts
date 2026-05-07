import type { Prisma } from '@prisma/client';

export type MindDecisionKind =
  | 'followup_timing'
  | 'message_format'
  | 'objection_response'
  | 'coupon_offer'
  | 'human_transfer'
  | 'channel_choice'
  | 'product_offer'
  | 'broadcast_window'
  | 'cart_recovery'
  | 'ad_alert_action';

export type MindGuardDecision = 'allow' | 'block' | 'modify' | 'needs_human';

export interface MindDecisionSpec {
  baseline: string;
  contextKeys: string[];
  decisionType: MindDecisionKind;
  options: string[];
  outcomeEvent: string;
  predicate: string;
}

export interface MindActionContext {
  channel?: string;
  contactOptOut?: boolean;
  contactMessagesToday?: number;
  discountPercent?: number;
  maxDiscountPercent?: number;
  minMarginPercent?: number;
  productId?: string;
  supportsAudio?: boolean;
  supportsDocument?: boolean;
  supportsNativeAudio?: boolean;
  templateApproved?: boolean;
  withinComplianceWindow?: boolean;
  [key: string]: unknown;
}

export interface MindGuardResult {
  allowed: boolean;
  action: string;
  context: Prisma.InputJsonObject;
  decision: MindGuardDecision;
  guardName: string;
  reason: string;
}
