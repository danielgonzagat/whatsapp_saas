import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SpineEventRef } from '../mind/mind.types';
import type {
  AggregatedSignal,
  CandidatePattern,
  SignalKind,
  WorkspaceEventSet,
} from './wisdom.types';

const MIN_EVENTS_FOR_SIGNAL = 10;
const MIN_WORKSPACES = 2;

function aggregateSignals(events: readonly SpineEventRef[], workspaceId: string): AggregatedSignal {
  let totalEvents = 0;
  let conversionCount = 0;
  let leadCount = 0;
  let paymentCount = 0;
  let refundCount = 0;
  let replyCount = 0;
  let handoffCount = 0;
  let campaignClickCount = 0;
  let dealWonCount = 0;
  let dealLostCount = 0;
  let positiveValenceCount = 0;
  let negativeValenceCount = 0;

  const leadIds = new Set<string>();
  const productIds = new Set<string>();
  const stages = new Set<string>();
  const hourCounts = new Map<number, number>();

  let minTimestamp = Infinity;
  let maxTimestamp = -Infinity;

  for (const event of events) {
    totalEvents++;

    const ts = Date.parse(event.occurredAt);
    if (Number.isFinite(ts)) {
      if (ts < minTimestamp) minTimestamp = ts;
      if (ts > maxTimestamp) maxTimestamp = ts;
    }

    const hour = new Date(event.occurredAt).getUTCHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);

    if (event.valence === 'positive') positiveValenceCount++;
    if (event.valence === 'negative') negativeValenceCount++;

    switch (event.eventName) {
      case 'commerce.lead.converted':
        conversionCount++;
        break;
      case 'commerce.lead.created':
        leadCount++;
        break;
      case 'commerce.payment.approved':
        paymentCount++;
        break;
      case 'commerce.payment.refunded':
        refundCount++;
        break;
      case 'commerce.whatsapp.message_replied':
        replyCount++;
        break;
      case 'commerce.whatsapp.handoff_to_human':
        handoffCount++;
        break;
      case 'commerce.campaign.clicked':
        campaignClickCount++;
        break;
      case 'commerce.crm.deal_won':
        dealWonCount++;
        break;
      case 'commerce.crm.deal_lost':
        dealLostCount++;
        break;
    }

    if (event.entityRef) {
      if (event.entityRef.entityType === 'lead') {
        leadIds.add(event.entityRef.entityId);
      }
    }

    const payload = event.payload as Record<string, unknown> | undefined;
    if (payload) {
      const pid = payload['productId'];
      if (typeof pid === 'string') productIds.add(pid);

      const stage = payload['toStage'] ?? payload['stage'];
      if (typeof stage === 'string') stages.add(stage);
    }
  }

  const observationWindowDays =
    minTimestamp < maxTimestamp
      ? Math.max(1, Math.round((maxTimestamp - minTimestamp) / (1000 * 60 * 60 * 24)))
      : 1;

  const peakHours = Array.from(hourCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([h]) => h)
    .sort((a, b) => a - b);

  return {
    workspaceId,
    totalEvents,
    conversionCount,
    leadCount,
    paymentCount,
    refundCount,
    replyCount,
    handoffCount,
    campaignClickCount,
    dealWonCount,
    dealLostCount,
    positiveValenceCount,
    negativeValenceCount,
    uniqueLeadIds: leadIds.size,
    uniqueProductIds: productIds.size,
    uniqueStages: [...stages],
    peakHours,
    observationWindowDays,
  };
}

function conversionRate(s: AggregatedSignal): number {
  if (s.leadCount === 0) return 0;
  return s.conversionCount / s.leadCount;
}

function replyRate(s: AggregatedSignal): number {
  if (s.totalEvents === 0) return 0;
  return s.replyCount / s.totalEvents;
}

function refundRate(s: AggregatedSignal): number {
  if (s.paymentCount === 0) return 0;
  return s.refundCount / s.paymentCount;
}

function handoffRate(s: AggregatedSignal): number {
  if (s.totalEvents === 0) return 0;
  return s.handoffCount / s.totalEvents;
}

function dealCloseRate(s: AggregatedSignal): number {
  const total = s.dealWonCount + s.dealLostCount;
  if (total === 0) return 0;
  return s.dealWonCount / total;
}

function confidenceFromCount(workspacesWithSignal: number, totalWorkspaces: number): number {
  if (totalWorkspaces === 0) return 0;
  const ratio = workspacesWithSignal / totalWorkspaces;
  return Math.min(0.95, 0.4 + ratio * 0.55);
}

function describeRate(
  kind: SignalKind,
  value: number,
  workspaceCount: number,
): string {
  const pct = `${(value * 100).toFixed(0)}%`;
  const wsLabel = `${workspaceCount} workspaces`;
  switch (kind) {
    case 'conversion_rate':
      return `Conversion rate averages ${pct} across ${wsLabel}`;
    case 'reply_rate':
      return `Reply rate averages ${pct} across ${wsLabel}`;
    case 'refund_rate':
      return `Refund rate averages ${pct} across ${wsLabel}`;
    case 'handoff_rate':
      return `Human handoff rate averages ${pct} across ${wsLabel}`;
    case 'deal_close_rate':
      return `Deal close rate averages ${pct} across ${wsLabel}`;
    case 'lead_volume':
      return `Lead volume pattern detected across ${wsLabel}`;
    case 'campaign_efficiency':
      return `Campaign click engagement pattern across ${wsLabel}`;
    case 'peak_activity':
      return `Peak activity hours pattern across ${wsLabel}`;
    case 'stage_distribution':
      return `Pipeline stage distribution pattern across ${wsLabel}`;
    case 'product_concentration':
      return `Product concentration pattern across ${wsLabel}`;
  }
}

function emitRatePatterns(
  signals: AggregatedSignal[],
  kind: SignalKind,
  compute: (s: AggregatedSignal) => number,
  threshold: number,
): CandidatePattern[] {
  const matching = signals.filter(s => s.totalEvents >= MIN_EVENTS_FOR_SIGNAL && compute(s) > 0);
  if (matching.length < MIN_WORKSPACES) return [];

  const avg = matching.reduce((sum, s) => sum + compute(s), 0) / matching.length;
  const description = describeRate(kind, avg, matching.length);

  return [{
    patternId: `pat_${randomUUID()}`,
    description,
    applicableConditions: [`${kind} > ${threshold}`],
    evidenceWorkspaceIds: matching.map(s => s.workspaceId),
    evidenceWorkspacesCount: matching.length,
    confidence: confidenceFromCount(matching.length, signals.length),
    signalKind: kind,
    aggregatedValue: avg,
  }];
}

function emitVolumePatterns(
  signals: AggregatedSignal[],
): CandidatePattern[] {
  const withLeads = signals.filter(s => s.leadCount >= MIN_EVENTS_FOR_SIGNAL);
  if (withLeads.length < MIN_WORKSPACES) return [];

  const totalLeads = withLeads.reduce((sum, s) => sum + s.leadCount, 0);
  const avgLeads = totalLeads / withLeads.length;

  return [{
    patternId: `pat_${randomUUID()}`,
    description: describeRate('lead_volume', avgLeads, withLeads.length),
    applicableConditions: ['lead_volume > 0'],
    evidenceWorkspaceIds: withLeads.map(s => s.workspaceId),
    evidenceWorkspacesCount: withLeads.length,
    confidence: confidenceFromCount(withLeads.length, signals.length),
    signalKind: 'lead_volume' as SignalKind,
    aggregatedValue: avgLeads,
  }];
}

function emitCampaignPatterns(
  signals: AggregatedSignal[],
): CandidatePattern[] {
  const withClicks = signals.filter(s => s.campaignClickCount >= 1);
  if (withClicks.length < MIN_WORKSPACES) return [];

  const total = withClicks.reduce((sum, s) => sum + s.campaignClickCount, 0);
  const avg = total / withClicks.length;

  return [{
    patternId: `pat_${randomUUID()}`,
    description: describeRate('campaign_efficiency', avg, withClicks.length),
    applicableConditions: ['campaign_activity > 0'],
    evidenceWorkspaceIds: withClicks.map(s => s.workspaceId),
    evidenceWorkspacesCount: withClicks.length,
    confidence: confidenceFromCount(withClicks.length, signals.length),
    signalKind: 'campaign_efficiency' as SignalKind,
    aggregatedValue: avg,
  }];
}

function emitStagePatterns(
  signals: AggregatedSignal[],
): CandidatePattern[] {
  const stageCounts = new Map<string, number>();
  for (const s of signals) {
    for (const stage of s.uniqueStages) {
      stageCounts.set(stage, (stageCounts.get(stage) ?? 0) + 1);
    }
  }

  if (stageCounts.size === 0) return [];

  const top = Array.from(stageCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const wsCount = signals.filter(s => s.uniqueStages.length > 0).length;

  return [{
    patternId: `pat_${randomUUID()}`,
    description: describeRate('stage_distribution', 0, wsCount),
    applicableConditions: top.map(([stage, count]) => `stage:${stage} (${count}ws)`),
    evidenceWorkspaceIds: signals.filter(s => s.uniqueStages.length > 0).map(s => s.workspaceId),
    evidenceWorkspacesCount: wsCount,
    confidence: confidenceFromCount(wsCount, signals.length),
    signalKind: 'stage_distribution' as SignalKind,
    aggregatedValue: top.length,
  }];
}

function emitProductConcentrationPatterns(
  signals: AggregatedSignal[],
): CandidatePattern[] {
  const withProducts = signals.filter(s => s.uniqueProductIds >= 1);
  if (withProducts.length < MIN_WORKSPACES) return [];

  const totalProducts = withProducts.reduce((sum, s) => sum + s.uniqueProductIds, 0);
  const avgProducts = totalProducts / withProducts.length;

  return [{
    patternId: `pat_${randomUUID()}`,
    description: describeRate('product_concentration', avgProducts, withProducts.length),
    applicableConditions: ['product_count > 0'],
    evidenceWorkspaceIds: withProducts.map(s => s.workspaceId),
    evidenceWorkspacesCount: withProducts.length,
    confidence: confidenceFromCount(withProducts.length, signals.length),
    signalKind: 'product_concentration' as SignalKind,
    aggregatedValue: avgProducts,
  }];
}

/**
 * WISDOM-001 — Pattern Extractor.
 *
 * Pure function: takes a list of per-workspace event sets and returns
 * an array of candidate patterns extracted from aggregated signals.
 * No identifiable data leaks — patterns are abstractions over aggregates.
 *
 * Input: WorkspaceEventSet[] (raw events grouped by workspaceId)
 * Output: CandidatePattern[] (abstract patterns, no PII)
 */
@Injectable()
export class WisdomPatternExtractorService {
  public extract(sets: readonly WorkspaceEventSet[]): CandidatePattern[] {
    if (sets.length < MIN_WORKSPACES) return [];

    const signals = sets.map(s => aggregateSignals(s.events, s.workspaceId));

    const patterns: CandidatePattern[] = [];

    patterns.push(...emitRatePatterns(signals, 'conversion_rate', conversionRate, 0));
    patterns.push(...emitRatePatterns(signals, 'reply_rate', replyRate, 0));
    patterns.push(...emitRatePatterns(signals, 'refund_rate', refundRate, 0));
    patterns.push(...emitRatePatterns(signals, 'handoff_rate', handoffRate, 0));
    patterns.push(...emitRatePatterns(signals, 'deal_close_rate', dealCloseRate, 0));
    patterns.push(...emitVolumePatterns(signals));
    patterns.push(...emitCampaignPatterns(signals));
    patterns.push(...emitStagePatterns(signals));
    patterns.push(...emitProductConcentrationPatterns(signals));

    return patterns;
  }
}
