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

export const MIND_GUARD_REASON_TAGS = [
  'opt_out',
  'compliance_window',
  'daily_contact_limit',
  'unsupported_audio',
  'unsupported_document',
  'checkout_product_required',
  'max_discount',
  'minimum_margin',
  'duplicate_payment',
  'payment_amount_exceeded',
  'campaign_budget_exhausted',
  'campaign_inactive',
  'escalation_in_progress',
  'no_human_available',
  'all_guards_passed',
] as const;

export type GuardReasonTag = (typeof MIND_GUARD_REASON_TAGS)[number];

export interface MindDecisionSpec {
  baseline: string;
  contextKeys: string[];
  decisionType: MindDecisionKind;
  fallbackBehavior: string;
  options: string[];
  outcomeEvent: string;
  predicate: string;
}

export interface MindActionContext {
  campaignActive?: boolean;
  campaignBudgetExhausted?: boolean;
  channel?: string;
  contactOptOut?: boolean;
  contactMessagesToday?: number;
  discountPercent?: number;
  escalationInProgress?: boolean;
  humanAvailable?: boolean;
  maxDiscountPercent?: number;
  maxPaymentAmount?: number;
  minMarginPercent?: number;
  paymentAmount?: number;
  paymentProcessed?: boolean;
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
  reasonTag: GuardReasonTag;
}
