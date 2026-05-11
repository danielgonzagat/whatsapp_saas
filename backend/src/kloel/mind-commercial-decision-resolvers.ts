import type { MindPolicyService } from './mind-policy.service';
import {
  resolveAdAlertActionBaseline,
  resolveBroadcastWindowBaseline,
  resolveChannelChoiceBaseline,
  resolveHumanTransferBaseline,
  resolveProductOfferBaseline,
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

export async function resolveHumanTransferDecision(
  policy: MindPolicyChooser,
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
  policy: MindPolicyChooser,
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
  policy: MindPolicyChooser,
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
  policy: MindPolicyChooser,
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
  policy: MindPolicyChooser,
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
