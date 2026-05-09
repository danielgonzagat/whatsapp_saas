import { resolveCaseMemoryAction, type CaseMemoryLookup } from './mind-case-memory-decision.helper';
import type { MindPolicyService } from './mind-policy.service';
import {
  TONE_OPTIONS,
  resolveAggressivenessBaseline,
  resolveAudioBaseline,
  resolveCouponBaseline,
  resolveMessageFormatBaseline,
  resolveObjectionResponseBaseline,
  resolveToneBaseline,
} from './mind-decision-baselines';

export type MindPolicyChooser = Pick<MindPolicyService, 'choose'>;

type PolicyDecisionResult = Awaited<ReturnType<MindPolicyChooser['choose']>>;

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
  policy: MindPolicyChooser,
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
  policy: MindPolicyChooser,
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
  policy: MindPolicyChooser,
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

export async function resolveMessageFormatDecision(
  policy: MindPolicyChooser,
  cases: CaseMemoryLookup,
  workspaceId: string,
  channel: string,
  concept: string,
  supports: string[] = ['text'],
): Promise<{ format: string; confidence: number; fallback: boolean }> {
  const allowed = ['text', 'audio', 'image', 'video', 'template', 'html_rich'].filter((format) =>
    supports.includes(format),
  );
  const options = allowed.length ? allowed : ['text'];
  const memoryAction = await resolveCaseMemoryAction(cases, {
    workspaceId,
    caseType: 'message_format',
    text: `channel ${channel} concept ${concept} supports ${options.join(',')}`,
    features: { channel, concept },
    options,
    minSimilarCases: 3,
    minSimilarityTotal: 1.2,
  });
  const baseline = memoryAction ?? resolveMessageFormatBaseline(channel, options);
  const result = await policy.choose({
    workspaceId,
    subject: `workspace:${workspaceId}`,
    decisionType: 'message_format',
    context: { channel, concept, supports: options.join(',') },
    options: options.map((format) => ({
      action: format,
      predicate: 'P(reply|message_type,hour,channel,concept)',
      context: { channel, concept, message_type: format },
    })),
    baseline: options.includes(baseline) ? baseline : options[0],
    outcomeKey: `message_format:${workspaceId}:${Date.now()}`,
  });

  return {
    format: result.chosen,
    confidence: decisionConfidence(result),
    fallback: result.decision.fallbackActive,
  };
}

export async function resolveObjectionResponseDecision(
  policy: MindPolicyChooser,
  cases: CaseMemoryLookup,
  workspaceId: string,
  channel: string,
  concept: string,
  priceBand: string,
  product?: string,
): Promise<{ strategy: string; confidence: number; fallback: boolean }> {
  const options = [
    'value_focus',
    'social_proof',
    'guarantee',
    'direct_comparison',
    'diagnostic_question',
    'human_transfer',
  ];
  const context: Record<string, unknown> = { channel, concept, priceBand };
  if (product) context.product = product;
  const memoryAction = await resolveCaseMemoryAction(cases, {
    workspaceId,
    caseType: 'objection_response',
    text:
      `channel ${channel} concept ${concept} priceBand ${priceBand}` +
      `${product ? ` product ${product}` : ''}`,
    features: context,
    options,
    minSimilarCases: 3,
    minSimilarityTotal: 1.2,
  });
  const baseline = memoryAction ?? resolveObjectionResponseBaseline(concept, priceBand);
  const result = await policy.choose({
    workspaceId,
    subject: `workspace:${workspaceId}`,
    decisionType: 'objection_response',
    context,
    options: options.map((strategy) => ({
      action: strategy,
      predicate: 'P(conversion|objection_strategy,concept,channel,price_band)',
      context: { ...context, objection_strategy: strategy },
    })),
    baseline,
    outcomeKey: `objection_response:${workspaceId}:${Date.now()}`,
    utilitySuccess: 1,
    utilityFail: -0.2,
  });

  return {
    strategy: result.chosen,
    confidence: decisionConfidence(result),
    fallback: result.decision.fallbackActive,
  };
}

export async function resolveCouponDecision(
  policy: MindPolicyChooser,
  cases: CaseMemoryLookup,
  workspaceId: string,
  priceBand: string,
  soldRate: number,
  segment?: string,
): Promise<{ action: string; confidence: number; fallback: boolean }> {
  const context = segment ? { priceBand, segment } : { priceBand };
  const options = [
    'no_coupon',
    'coupon_5',
    'coupon_10',
    'coupon_15',
    'coupon_20',
    'human_negotiate',
  ];
  const memoryAction = await resolveCaseMemoryAction(cases, {
    workspaceId,
    caseType: 'coupon_offer',
    text: `priceBand ${priceBand} soldRate ${soldRate.toFixed(2)}${segment ? ` segment ${segment}` : ''}`,
    features: { priceBand, ...(segment ? { segment } : {}) },
    options,
    minSimilarCases: 3,
    minSimilarityTotal: 1.2,
  });
  const result = await policy.choose({
    workspaceId,
    subject: `workspace:${workspaceId}`,
    decisionType: 'coupon_offer',
    context: { ...context, soldRate },
    options: options.map((action) => ({
      action,
      predicate: 'P(conversion|discount_offered,segment,price_band)',
      context: { ...context, discount_offered: action },
    })),
    baseline: memoryAction ?? resolveCouponBaseline(priceBand, soldRate),
    outcomeKey: `coupon_offer:${workspaceId}:${Date.now()}`,
    utilitySuccess: 1,
    utilityFail: -0.2,
  });

  return {
    action: result.chosen,
    confidence: decisionConfidence(result),
    fallback: result.decision.fallbackActive,
  };
}
