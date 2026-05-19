/**
 * UTP-TEAM-002 — Next-Best-Action Suggester
 *
 * Produces top 3 suggestions ranked by fit for the operator.
 * Uses INSIGHT/MATURITY signals when available; degrades gracefully
 * when they are not provided.
 */

import type {
  NextBestAction,
  PreCallContext,
  SuggestInput,
  SuggestionR1Contract,
} from './team.types';

const MIN_CONFIDENCE = 0.15;
const MAX_SUGGESTIONS = 3;

interface ActionTemplate {
  readonly condition: (ctx: PreCallContext) => boolean;
  readonly action: string;
  readonly rationale: string;
  readonly baseConfidence: number;
  readonly guardrails: readonly string[];
  readonly evidencePattern: readonly string[];
  readonly r1Contract: SuggestionR1Contract;
}

function hasEvent(ctx: PreCallContext, eventName: string): boolean {
  return ctx.leadHistory.some((e) => e.eventName === eventName);
}

function daysSince(iso: string, nowIso: string): number {
  const ms = new Date(nowIso).getTime() - new Date(iso).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

const R1_ALLOWED_ALONE: SuggestionR1Contract = {
  riskClass: 'R1',
  delegationMode: 'allowed_alone',
  safeNextStep: 'show suggestion only; do not send or change deal state',
  rollback: ['dismiss_suggestion', 'snooze_suggestion'],
  leadOutcomeGuardrail: {
    antiPressureLanguage: false,
    respectsSilenceWindow: false,
    requiresContextQualification: false,
  },
};

const R1_REVIEW_DEFAULT: SuggestionR1Contract = {
  riskClass: 'R1',
  delegationMode: 'allowed_alone',
  safeNextStep: 'review lead status before suggesting each outbound action',
  rollback: ['dismiss_suggestion', 'snooze_suggestion'],
  leadOutcomeGuardrail: {
    antiPressureLanguage: false,
    respectsSilenceWindow: false,
    requiresContextQualification: false,
  },
};

const R1_SILENT_QUALIFIED: SuggestionR1Contract = {
  riskClass: 'R1',
  delegationMode: 'allowed_alone',
  safeNextStep:
    'surface an honest re-engagement suggestion for owner review; do not send',
  rollback: ['dismiss_suggestion', 'snooze_suggestion'],
  leadOutcomeGuardrail: {
    antiPressureLanguage: true,
    respectsSilenceWindow: true,
    requiresContextQualification: true,
  },
};

const R1_SILENT_UNQUALIFIED: SuggestionR1Contract = {
  riskClass: 'R1',
  delegationMode: 'allowed_alone',
  safeNextStep:
    'review timeline and gather context before every re-engagement suggestion',
  rollback: ['dismiss_suggestion', 'snooze_suggestion'],
  leadOutcomeGuardrail: {
    antiPressureLanguage: true,
    respectsSilenceWindow: true,
    requiresContextQualification: false,
  },
};

const R2_HANDLE_OBJECTION: SuggestionR1Contract = {
  riskClass: 'R2',
  delegationMode: 'requires_review',
  safeNextStep: 'draft objection response for explicit owner review',
  rollback: ['dismiss_suggestion', 'snooze_suggestion', 'manual_review'],
  leadOutcomeGuardrail: {
    antiPressureLanguage: true,
    respectsSilenceWindow: false,
    requiresContextQualification: true,
  },
};

const R2_RECOVER_REVENUE: SuggestionR1Contract = {
  riskClass: 'R2',
  delegationMode: 'requires_review',
  safeNextStep:
    'prepare recovery recommendation with no discount or urgency pressure',
  rollback: ['dismiss_suggestion', 'snooze_suggestion', 'manual_review'],
  leadOutcomeGuardrail: {
    antiPressureLanguage: true,
    respectsSilenceWindow: false,
    requiresContextQualification: true,
  },
};

const R2_POST_SALE: SuggestionR1Contract = {
  riskClass: 'R2',
  delegationMode: 'human_only',
  safeNextStep: 'ask human to verify delivery before every post-sale message',
  rollback: ['dismiss_suggestion', 'snooze_suggestion', 'manual_review'],
  leadOutcomeGuardrail: {
    antiPressureLanguage: true,
    respectsSilenceWindow: false,
    requiresContextQualification: false,
  },
};

const R2_CLOSE_QUALIFIED: SuggestionR1Contract = {
  riskClass: 'R2',
  delegationMode: 'requires_review',
  safeNextStep: 'draft next closing step for explicit owner review',
  rollback: ['dismiss_suggestion', 'snooze_suggestion', 'manual_review'],
  leadOutcomeGuardrail: {
    antiPressureLanguage: true,
    respectsSilenceWindow: false,
    requiresContextQualification: false,
  },
};

const ACTION_TEMPLATES: readonly ActionTemplate[] = [
  {
    condition: (ctx) =>
      !hasEvent(ctx, 'commerce.lead.contacted') &&
      hasEvent(ctx, 'commerce.lead.created'),
    action: 'make_initial_contact',
    rationale: 'lead created but never contacted - first touch needed',
    baseConfidence: 0.82,
    guardrails: ['verify lead is not duplicated', 'check workspace reply policy'],
    evidencePattern: ['commerce.lead.created'],
    r1Contract: R1_ALLOWED_ALONE,
  },
  {
    condition: (ctx) =>
      hasEvent(ctx, 'commerce.lead.went_silent') &&
      !hasEvent(ctx, 'commerce.lead.replied') &&
      (hasEvent(ctx, 'commerce.lead.objection_raised') ||
        hasEvent(ctx, 'commerce.cart.abandoned')),
    action: 'reengage_silent_lead',
    rationale:
      'lead went silent after commercial context (objection or cart) - qualified re-engagement recommended',
    baseConfidence: 0.75,
    guardrails: [
      'respect silence window',
      'acknowledge prior concern or hesitation directly',
      'no urgency pressure - timing must be lead-driven',
    ],
    evidencePattern: ['commerce.lead.went_silent'],
    r1Contract: R1_SILENT_QUALIFIED,
  },
  {
    condition: (ctx) =>
      hasEvent(ctx, 'commerce.lead.went_silent') &&
      !(hasEvent(ctx, 'commerce.lead.objection_raised') ||
        hasEvent(ctx, 'commerce.cart.abandoned')),
    action: 'review_silent_lead',
    rationale:
      'lead went silent without clear commercial context - review timeline before assuming disinterest',
    baseConfidence: 0.55,
    guardrails: [
      'do not assume disinterest - silence may be external',
      'anti-pressure language required: no urgency framing',
      'seek additional signals before re-engagement',
    ],
    evidencePattern: ['commerce.lead.went_silent'],
    r1Contract: R1_SILENT_UNQUALIFIED,
  },
  {
    condition: (ctx) =>
      hasEvent(ctx, 'commerce.lead.objection_raised'),
    action: 'handle_objection',
    rationale: 'lead raised objection - address before advancing',
    baseConfidence: 0.8,
    guardrails: ['understand objection type', 'do not dismiss concern'],
    evidencePattern: ['commerce.lead.objection_raised'],
    r1Contract: R2_HANDLE_OBJECTION,
  },
  {
    condition: (ctx) =>
      hasEvent(ctx, 'commerce.lead.replied') &&
      !hasEvent(ctx, 'commerce.whatsapp.message_replied'),
    action: 'respond_to_reply',
    rationale: 'lead replied but no operator response yet',
    baseConfidence: 0.85,
    guardrails: ['reply within response window', 'maintain conversation tone'],
    evidencePattern: ['commerce.lead.replied'],
    r1Contract: R1_ALLOWED_ALONE,
  },
  {
    condition: (ctx) =>
      ctx.currentStage !== undefined &&
      hasEvent(ctx, 'commerce.crm.stage_changed'),
    action: 'advance_pipeline_stage',
    rationale: 'lead is in active pipeline stage - define next CRM step',
    baseConfidence: 0.78,
    guardrails: ['stage-appropriate actions only', 'respect deal velocity'],
    evidencePattern: ['commerce.crm.stage_changed'],
    r1Contract: R1_ALLOWED_ALONE,
  },
  {
    condition: (ctx) =>
      hasEvent(ctx, 'commerce.cart.abandoned') ||
      hasEvent(ctx, 'commerce.payment.declined'),
    action: 'recover_revenue',
    rationale: 'revenue signal detected - recovery opportunity',
    baseConfidence: 0.8,
    guardrails: ['avoid desperation pattern', 'offer genuine help'],
    evidencePattern: ['commerce.cart.abandoned', 'commerce.payment.declined'],
    r1Contract: R2_RECOVER_REVENUE,
  },
  {
    condition: (ctx) =>
      hasEvent(ctx, 'commerce.post_sale.churn_risk_detected'),
    action: 'review_post_sale_value_gap',
    rationale:
      'post-sale churn risk detected - verify whether the customer reached first value before every retention action',
    baseConfidence: 0.9,
    guardrails: [
      'frame as customer support, not team failure',
      'verify first value before win-back or upsell',
      'do not send retention message without human review',
    ],
    evidencePattern: ['commerce.post_sale.churn_risk_detected'],
    r1Contract: R2_POST_SALE,
  },
  {
    condition: (ctx) =>
      hasEvent(ctx, 'commerce.payment.approved') &&
      !ctx.openQuestions.some((q) => q.includes('onboarding')),
    action: 'ensure_post_sale_activation',
    rationale: 'payment approved - confirm delivery and activation',
    baseConfidence: 0.88,
    guardrails: ['do not up-sell during onboarding', 'verify delivery first'],
    evidencePattern: ['commerce.payment.approved'],
    r1Contract: R2_POST_SALE,
  },
  {
    condition: (ctx) =>
      hasEvent(ctx, 'commerce.lead.qualified') &&
      !hasEvent(ctx, 'commerce.lead.converted'),
    action: 'close_qualified_lead',
    rationale: 'lead qualified but not converted - closing window open',
    baseConfidence: 0.83,
    guardrails: ['match closing style to lead profile', 'do not pressure'],
    evidencePattern: ['commerce.lead.qualified'],
    r1Contract: R2_CLOSE_QUALIFIED,
  },
  {
    condition: () => true,
    action: 'review_lead_status',
    rationale: 'no specific action signal - review lead status and next steps',
    baseConfidence: 0.4,
    guardrails: ['stay within operator role boundaries'],
    evidencePattern: ['commerce.lead.created'],
    r1Contract: R1_REVIEW_DEFAULT,
  },
];

function adjustConfidence(
  base: number,
  ctx: PreCallContext,
  maturityStage?: string,
): number {
  let adjusted = base;

  if (maturityStage === 'otimizacao' || maturityStage === 'maturidade') {
    adjusted += 0.05;
  }

  const positiveCount = ctx.valenceTrace.filter(
    (v) => v.valence === 'positive',
  ).length;
  const negativeCount = ctx.valenceTrace.filter(
    (v) => v.valence === 'negative',
  ).length;

  if (positiveCount > negativeCount) {
    adjusted += 0.03;
  } else if (negativeCount > positiveCount) {
    adjusted -= 0.05;
  }

  if (ctx.openQuestions.length === 0) {
    adjusted += 0.02;
  }

  const now = new Date().toISOString();
  if (ctx.lastContactAt) {
    const days = daysSince(ctx.lastContactAt, now);
    if (days > 7) {
      adjusted -= 0.1;
    }
  }

  return Math.max(MIN_CONFIDENCE, Math.min(0.95, adjusted));
}

function selectEvidence(
  ctx: PreCallContext,
  patterns: readonly string[],
): readonly string[] {
  const ids: string[] = [];
  for (const e of ctx.leadHistory) {
    if (patterns.includes(e.eventName) && !ids.includes(e.eventId)) {
      ids.push(e.eventId);
    }
  }
  return ids;
}

export function suggestNextBestActions(input: SuggestInput): readonly NextBestAction[] {
  const { context, maturityStage } = input;

  const candidates = ACTION_TEMPLATES.filter((t) => t.condition(context));

  const scored = candidates.map((t, i) => {
    const confidence = adjustConfidence(t.baseConfidence, context, maturityStage);
    const evidence = selectEvidence(context, [...t.evidencePattern]);
    return {
      rank: 0,
      action: t.action,
      rationale: t.rationale,
      confidence: Math.round(confidence * 100) / 100,
      evidenceRefs: evidence,
      guardrails: [...t.guardrails],
      r1Contract: t.r1Contract,
      scoreOrder: i,
    };
  });

  const sorted = scored.sort((a, b) => {
    const diff = b.confidence - a.confidence;
    if (Math.abs(diff) > 0.001) return diff > 0 ? 1 : -1;
    return a.scoreOrder - b.scoreOrder;
  });

  const top = sorted.slice(0, MAX_SUGGESTIONS);

  return top.map(
    (item, idx): NextBestAction => ({
      rank: idx + 1,
      action: item.action,
      rationale: item.rationale,
      confidence: item.confidence,
      evidenceRefs: item.evidenceRefs,
      guardrails: item.guardrails,
      r1Contract: item.r1Contract,
    }),
  );
}
