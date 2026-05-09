import { resolveCaseMemoryAction, type CaseMemoryLookup } from './mind-case-memory-decision.helper';
import type { MindPolicyService } from './mind-policy.service';
import {
  TONE_OPTIONS,
  resolveAdAlertActionBaseline,
  resolveAggressivenessBaseline,
  resolveAudioBaseline,
  resolveBroadcastWindowBaseline,
  resolveChannelChoiceBaseline,
  resolveCouponBaseline,
  resolveHumanTransferBaseline,
  resolveProductOfferBaseline,
  resolveToneBaseline,
} from './mind-decision-baselines';

type PolicyDecisionResult = Awaited<ReturnType<MindPolicyService['choose']>>;

function decisionConfidence(result: PolicyDecisionResult): number {
  return (
    result.decision.candidates.find((candidate) => candidate.action === result.chosen)
      ?.beliefMean ??
    result.decision.candidates[0]?.beliefMean ??
    0
  );
}

function formatDecimal(value: number, fractionDigits: number): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
    useGrouping: false,
  }).format(value);
}

export async function resolveAggressivenessDecision(
  policy: MindPolicyService,
  workspaceId: string,
  domain: string,
  soldRate: number,
  repliedRate: number,
  revenuePerSignal: number,
): Promise<{ aggressiveness: string; confidence: number; fallback: boolean }> {
  const baseline = resolveAggressivenessBaseline(soldRate, repliedRate, revenuePerSignal);
  const result = await policy.choose({
    workspaceId,
    subject: `workspace:${workspaceId}`,
    decisionType: 'cia_aggressiveness',
    context: { domain, soldRate, repliedRate, revenuePerSignal },
    options: ['LOW', 'MEDIUM', 'HIGH'].map((aggressiveness) => ({
      action: aggressiveness,
      predicate: 'P(outcome|aggressiveness)',
      context: { domain, aggressiveness },
    })),
    baseline,
    outcomeKey: `cia_aggressiveness:${workspaceId}:${Date.now()}`,
  });

  return {
    aggressiveness: result.chosen,
    confidence: decisionConfidence(result),
    fallback: result.decision.fallbackActive,
  };
}

export async function resolveAudioVsTextDecision(
  policy: MindPolicyService,
  cases: CaseMemoryLookup,
  workspaceId: string,
  channel: string,
  audioRatio: number,
): Promise<{ choice: string; confidence: number; fallback: boolean }> {
  const memoryAction = await resolveCaseMemoryAction(cases, {
    workspaceId,
    caseType: 'audio_vs_text',
    text: `channel ${channel} audioRatio ${formatDecimal(audioRatio, 2)}`,
    features: { channel },
    options: ['audio', 'text'],
    minSimilarCases: 3,
    minSimilarityTotal: 1.2,
  });
  const result = await policy.choose({
    workspaceId,
    subject: `workspace:${workspaceId}`,
    decisionType: 'audio_vs_text',
    context: { channel, audioRatio },
    options: ['audio', 'text'].map((messageType) => ({
      action: messageType,
      predicate: 'P(reply|message_type,hour,channel)',
      context: { channel, message_type: messageType },
    })),
    baseline: memoryAction ?? resolveAudioBaseline(channel, audioRatio),
    outcomeKey: `audio_vs_text:${workspaceId}:${Date.now()}`,
  });

  return {
    choice: result.chosen,
    confidence: decisionConfidence(result),
    fallback: result.decision.fallbackActive,
  };
}

export async function resolveToneDecision(
  policy: MindPolicyService,
  cases: CaseMemoryLookup,
  workspaceId: string,
  channel: string,
  repliedRate: number,
  soldRate: number,
  segment?: string,
): Promise<{ tone: string; confidence: number; fallback: boolean }> {
  const context = segment ? { channel, segment } : { channel };
  const memoryAction = await resolveCaseMemoryAction(cases, {
    workspaceId,
    caseType: 'tom',
    text:
      `channel ${channel} repliedRate ${formatDecimal(repliedRate, 2)} ` +
      `soldRate ${formatDecimal(soldRate, 2)}${segment ? ` segment ${segment}` : ''}`,
    features: { channel, ...(segment ? { segment } : {}) },
    options: [...TONE_OPTIONS],
    minSimilarCases: 3,
    minSimilarityTotal: 1.2,
  });
  const result = await policy.choose({
    workspaceId,
    subject: `workspace:${workspaceId}`,
    decisionType: 'tom',
    context: { ...context, repliedRate, soldRate },
    options: TONE_OPTIONS.map((tone) => ({
      action: tone,
      predicate: 'P(reply|tone,objection_type,channel)',
      context: { ...context, tone },
    })),
    baseline: memoryAction ?? resolveToneBaseline(repliedRate, soldRate, channel),
    outcomeKey: `tom:${workspaceId}:${Date.now()}`,
    utilitySuccess: 1,
    utilityFail: -0.1,
  });

  return {
    tone: result.chosen,
    confidence: decisionConfidence(result),
    fallback: result.decision.fallbackActive,
  };
}

export async function resolveCouponDecision(
  policy: MindPolicyService,
  cases: CaseMemoryLookup,
  workspaceId: string,
  priceBand: string,
  soldRate: number,
  segment?: string,
): Promise<{ action: string; confidence: number; fallback: boolean }> {
  const context = segment ? { priceBand, segment } : { priceBand };
  const memoryAction = await resolveCaseMemoryAction(cases, {
    workspaceId,
    caseType: 'cupom',
    text: `priceBand ${priceBand} soldRate ${soldRate.toFixed(2)}${segment ? ` segment ${segment}` : ''}`,
    features: { priceBand, ...(segment ? { segment } : {}) },
    options: ['offer_coupon', 'no_coupon'],
    minSimilarCases: 3,
    minSimilarityTotal: 1.2,
  });
  const result = await policy.choose({
    workspaceId,
    subject: `workspace:${workspaceId}`,
    decisionType: 'cupom',
    context: { ...context, soldRate },
    options: ['offer_coupon', 'no_coupon'].map((action) => ({
      action,
      predicate: 'P(conversion|discount_offered,segment,price_band)',
      context: { ...context, discount_offered: action === 'offer_coupon' ? 'yes' : 'no' },
    })),
    baseline: memoryAction ?? resolveCouponBaseline(priceBand, soldRate),
    outcomeKey: `cupom:${workspaceId}:${Date.now()}`,
    utilitySuccess: 1,
    utilityFail: -0.2,
  });

  return {
    action: result.chosen,
    confidence: decisionConfidence(result),
    fallback: result.decision.fallbackActive,
  };
}

export async function resolveHumanTransferDecision(
  policy: MindPolicyService,
  workspaceId: string,
  channel: string,
  concept: string,
  ticketRisk: number,
  options?: { escalationInProgress?: boolean; humanAvailable?: boolean },
): Promise<{ action: string; confidence: number; fallback: boolean }> {
  const baseline = resolveHumanTransferBaseline(channel, concept, ticketRisk);
  const context: Record<string, unknown> = { channel, concept, ticketRisk };
  if (options?.escalationInProgress !== undefined) {
    context.escalationInProgress = options.escalationInProgress;
  }
  if (options?.humanAvailable !== undefined) {
    context.humanAvailable = options.humanAvailable;
  }

  const result = await policy.choose({
    workspaceId,
    subject: `workspace:${workspaceId}`,
    decisionType: 'human_transfer',
    context,
    options: ['continue_ai', 'transfer_now', 'transfer_after_next_reply', 'pause_wait'].map(
      (action) => ({
        action,
        predicate: 'P(conversion|handoff_policy,concept,channel,ticket)',
        context: { channel, concept, ticketRisk, handoff: action },
      }),
    ),
    baseline,
    outcomeKey: `human_transfer:${workspaceId}:${Date.now()}`,
  });

  return {
    action: result.chosen,
    confidence: decisionConfidence(result),
    fallback: result.decision.fallbackActive,
  };
}

export async function resolveChannelChoiceDecision(
  policy: MindPolicyService,
  workspaceId: string,
  availableChannels: string[],
  segment?: string,
  hour?: number,
  concept?: string,
): Promise<{ channel: string; confidence: number; fallback: boolean }> {
  const baseline = resolveChannelChoiceBaseline(availableChannels, segment);
  const context = {
    availableChannels: availableChannels.join(','),
    segment: segment ?? 'unknown',
    hour: hour ?? 12,
    concept: concept ?? 'general',
  };

  const result = await policy.choose({
    workspaceId,
    subject: `workspace:${workspaceId}`,
    decisionType: 'channel_choice',
    context,
    options: availableChannels.map((channel) => ({
      action: channel,
      predicate: 'P(reply|preferred_channel,segment,hour,concept)',
      context: { ...context, channel },
    })),
    baseline,
    outcomeKey: `channel_choice:${workspaceId}:${Date.now()}`,
  });

  return {
    channel: result.chosen,
    confidence: decisionConfidence(result),
    fallback: result.decision.fallbackActive,
  };
}

export async function resolveProductOfferDecision(
  policy: MindPolicyService,
  workspaceId: string,
  segment: string,
  concept: string,
  priceBand: string,
  lastPurchase?: string,
): Promise<{ offer: string; confidence: number; fallback: boolean }> {
  const baseline = resolveProductOfferBaseline(segment, concept, priceBand);
  const context: Record<string, unknown> = { segment, concept, priceBand };
  if (lastPurchase) context.lastPurchase = lastPurchase;

  const result = await policy.choose({
    workspaceId,
    subject: `workspace:${workspaceId}`,
    decisionType: 'product_offer',
    context,
    options: ['top_seller', 'highest_margin', 'entry_product', 'premium_product', 'upsell'].map(
      (offer) => ({
        action: offer,
        predicate: 'P(conversion|product_offer,segment,concept,price_band)',
        context: { segment, concept, priceBand, offer },
      }),
    ),
    baseline,
    outcomeKey: `product_offer:${workspaceId}:${Date.now()}`,
  });

  return {
    offer: result.chosen,
    confidence: decisionConfidence(result),
    fallback: result.decision.fallbackActive,
  };
}

export async function resolveBroadcastWindowDecision(
  policy: MindPolicyService,
  workspaceId: string,
  channel: string,
  segment: string,
  weekday?: string,
  fatigue?: number,
): Promise<{ window: string; confidence: number; fallback: boolean }> {
  const baseline = resolveBroadcastWindowBaseline(channel, weekday ?? 'monday', fatigue ?? 0);
  const context = { channel, segment, weekday: weekday ?? 'monday', fatigue: fatigue ?? 0 };
  const actions = ['now', 'tonight_20h', 'tomorrow_9h', 'friday_21h'];
  if (fatigue !== undefined && fatigue >= 0.8) actions.push('pause');

  const result = await policy.choose({
    workspaceId,
    subject: `workspace:${workspaceId}`,
    decisionType: 'broadcast_window',
    context,
    options: actions.map((window) => ({
      action: window,
      predicate: 'P(conversion|broadcast_window,channel,segment)',
      context: { channel, segment, weekday: weekday ?? 'monday', window },
    })),
    baseline,
    outcomeKey: `broadcast_window:${workspaceId}:${Date.now()}`,
  });

  return {
    window: result.chosen,
    confidence: decisionConfidence(result),
    fallback: result.decision.fallbackActive,
  };
}

export async function resolveAdAlertActionDecision(
  policy: MindPolicyService,
  workspaceId: string,
  metric: string,
  window: number,
  threshold: string,
  campaign?: string,
): Promise<{ action: string; confidence: number; fallback: boolean }> {
  const baseline = resolveAdAlertActionBaseline(metric, threshold);
  const context = { metric, window, threshold, campaign: campaign ?? 'unknown' };
  const actions = [
    'alert_only',
    'suggest_pause',
    'suggest_budget_down',
    'suggest_creative',
    'ignore',
  ];

  const result = await policy.choose({
    workspaceId,
    subject: `workspace:${workspaceId}`,
    decisionType: 'ad_alert_action',
    context,
    options: actions.map((action) => ({
      action,
      predicate: 'P(success|ad_alert_action,metric,window)',
      context: { metric, window, alertAction: action },
    })),
    baseline,
    outcomeKey: `ad_alert_action:${workspaceId}:${Date.now()}`,
  });

  return {
    action: result.chosen,
    confidence: decisionConfidence(result),
    fallback: result.decision.fallbackActive,
  };
}
