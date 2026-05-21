export type RuleCategory =
  | 'opt_out'
  | 'compliance_window'
  | 'limits'
  | 'coupon'
  | 'transfer'
  | 'payment';

export interface RuleContext {
  action: string;
  channel?: string;
  contactOptOut?: boolean;
  withinComplianceWindow?: boolean;
  templateApproved?: boolean;
  contactMessagesToday?: number;
  campaignBudgetExhausted?: boolean;
  campaignActive?: boolean;
  paymentProcessed?: boolean;
  paymentAmount?: number;
  maxPaymentAmount?: number;
  discountPercent?: number;
  maxDiscountPercent?: number;
  minMarginPercent?: number;
  escalationInProgress?: boolean;
  humanAvailable?: boolean;
  productId?: string;
  supportsAudio?: boolean;
  supportsDocument?: boolean;
  supportsNativeAudio?: boolean;
  [key: string]: unknown;
}

export interface RuleVerdict {
  ruleId: string;
  category: RuleCategory;
  passed: boolean;
  reason: string;
}

export interface RuleTrace {
  verdicts: RuleVerdict[];
  blocked: boolean;
  blockedBy: string | null;
  blockedReason: string | null;
  durationMs: number;
}

export interface RuleDefinition {
  id: string;
  category: RuleCategory;
  description: string;
  evaluate(ctx: RuleContext): RuleVerdict;
}
