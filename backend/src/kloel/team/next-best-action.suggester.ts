/**
 * UTP-TEAM-002 — Next-Best-Action Suggester
 *
 * Produces top 3 suggestions ranked by fit for the operator.
 * Uses INSIGHT/MATURITY signals when available; degrades gracefully
 * when they are not provided.
 */

import type { NextBestAction, PreCallContext, SuggestInput } from './team.types';

const MIN_CONFIDENCE = 0.15;
const MAX_SUGGESTIONS = 3;

interface ActionTemplate {
  readonly condition: (ctx: PreCallContext) => boolean;
  readonly action: string;
  readonly rationale: string;
  readonly baseConfidence: number;
  readonly guardrails: readonly string[];
  readonly evidencePattern: readonly string[];
}

function hasEvent(ctx: PreCallContext, eventName: string): boolean {
  return ctx.leadHistory.some((e) => e.eventName === eventName);
}

function daysSince(iso: string, nowIso: string): number {
  const ms = new Date(nowIso).getTime() - new Date(iso).getTime();
  return ms / (1000 * 60 * 60 * 24);
}

const ACTION_TEMPLATES: readonly ActionTemplate[] = [
  {
    condition: (ctx) =>
      !hasEvent(ctx, 'commerce.lead.contacted') &&
      hasEvent(ctx, 'commerce.lead.created'),
    action: 'make_initial_contact',
    rationale: 'lead created but never contacted — first touch needed',
    baseConfidence: 0.82,
    guardrails: ['verify lead is not duplicated', 'check workspace reply policy'],
    evidencePattern: ['commerce.lead.created'],
  },
  {
    condition: (ctx) =>
      hasEvent(ctx, 'commerce.lead.went_silent') &&
      !hasEvent(ctx, 'commerce.lead.replied'),
    action: 'reengage_silent_lead',
    rationale: 'lead went silent without replying — re-engagement recommended',
    baseConfidence: 0.75,
    guardrails: ['respect silence window', 'avoid desperate tone'],
    evidencePattern: ['commerce.lead.went_silent'],
  },
  {
    condition: (ctx) =>
      hasEvent(ctx, 'commerce.lead.objection_raised'),
    action: 'handle_objection',
    rationale: 'lead raised objection — address before advancing',
    baseConfidence: 0.8,
    guardrails: ['understand objection type', 'do not dismiss concern'],
    evidencePattern: ['commerce.lead.objection_raised'],
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
  },
  {
    condition: (ctx) =>
      ctx.currentStage !== undefined &&
      hasEvent(ctx, 'commerce.crm.stage_changed'),
    action: 'advance_pipeline_stage',
    rationale: 'lead is in active pipeline stage — define next CRM step',
    baseConfidence: 0.78,
    guardrails: ['stage-appropriate actions only', 'respect deal velocity'],
    evidencePattern: ['commerce.crm.stage_changed'],
  },
  {
    condition: (ctx) =>
      hasEvent(ctx, 'commerce.cart.abandoned') ||
      hasEvent(ctx, 'commerce.payment.declined'),
    action: 'recover_revenue',
    rationale: 'revenue signal detected — recovery opportunity',
    baseConfidence: 0.8,
    guardrails: ['avoid desperation pattern', 'offer genuine help'],
    evidencePattern: ['commerce.cart.abandoned', 'commerce.payment.declined'],
  },
  {
    condition: (ctx) =>
      hasEvent(ctx, 'commerce.payment.approved') &&
      !ctx.openQuestions.some((q) => q.includes('onboarding')),
    action: 'ensure_post_sale_activation',
    rationale: 'payment approved — confirm delivery and activation',
    baseConfidence: 0.88,
    guardrails: ['do not up-sell during onboarding', 'verify delivery first'],
    evidencePattern: ['commerce.payment.approved'],
  },
  {
    condition: (ctx) =>
      hasEvent(ctx, 'commerce.lead.qualified') &&
      !hasEvent(ctx, 'commerce.lead.converted'),
    action: 'close_qualified_lead',
    rationale: 'lead qualified but not converted — closing window open',
    baseConfidence: 0.83,
    guardrails: ['match closing style to lead profile', 'do not pressure'],
    evidencePattern: ['commerce.lead.qualified'],
  },
  {
    condition: () => true,
    action: 'review_lead_status',
    rationale: 'no specific action signal — review lead status and next steps',
    baseConfidence: 0.4,
    guardrails: ['stay within operator role boundaries'],
    evidencePattern: ['commerce.lead.created'],
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
    }),
  );
}
