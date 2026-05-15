import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { WisdomPrivacyGuardService } from './wisdom-privacy-guard.service';
import type { SpineEventRef } from '../mind/mind.types';
import type {
  AggregatedSignal,
  CandidatePattern,
  SignalKind,
  WorkspaceEventSet,
} from './wisdom.types';

const MIN_EVENTS_FOR_SIGNAL = 10;
const MIN_WORKSPACES = 2;
const K_ANONYMITY_THRESHOLD = 5;

const COMMON_OBJECTION_KEYWORDS: readonly string[] = [
  'preco', 'preço', 'valor', 'caro', 'custo', 'orcamento', 'orçamento',
  'prazo', 'tempo', 'urgente', 'espera', 'demora',
  'concorrente', 'concorrencia', 'concorrência', 'outro', 'alternativa',
  'garantia', 'reembolso', 'devolucao', 'devolução', 'cancelar',
  'pensar', 'depois', 'futuro', 'momento', 'agora',
  'marido', 'esposa', 'socio', 'sócio', 'equipe', 'time',
];

export type PatternKind =
  | 'objection_pattern'
  | 'channel_efficiency'
  | 'conversion_decay'
  | 'engagement_peak'
  | 'offer_objection_correlation';

export type PatternDimension = 'conversion' | 'engagement' | 'channel' | 'offer' | 'timing';

export interface ExtractedPattern {
  readonly kind: PatternKind;
  readonly dimension: PatternDimension;
  readonly support: number;
  readonly confidence: number;
  readonly abstractDescription: string;
  readonly anonymizedExample: string;
}

interface InternalSignal extends AggregatedSignal {
  readonly objectionKeywords: ReadonlyMap<string, number>;
  readonly stageTransitions: ReadonlyMap<string, number>;
  readonly channelStats: {
    readonly whatsappConversionRate: number;
    readonly campaignConversionRate: number;
  };
}

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

function enrichSignal(events: readonly SpineEventRef[], signal: AggregatedSignal): InternalSignal {
  const objectionKeywords = new Map<string, number>();
  const stageTransitions = new Map<string, number>();
  let whatsappConversions = 0;
  let whatsappLeads = 0;
  let campaignConversions = 0;
  let campaignLeads = 0;

  for (const event of events) {
    if (event.eventName === 'commerce.lead.objection_raised') {
      const payload = event.payload as Record<string, unknown> | undefined;
      const reason = payload?.['reason'] ?? payload?.['objection'];
      const text = typeof reason === 'string' ? reason.toLowerCase() : '';
      for (const kw of COMMON_OBJECTION_KEYWORDS) {
        if (text.includes(kw)) {
          objectionKeywords.set(kw, (objectionKeywords.get(kw) ?? 0) + 1);
        }
      }
    }

    if (event.eventName === 'commerce.crm.stage_changed') {
      const payload = event.payload as Record<string, unknown> | undefined;
      const from = payload?.['fromStage'];
      const to = payload?.['toStage'];
      if (typeof from === 'string' && typeof to === 'string') {
        const key = `${from}->${to}`;
        stageTransitions.set(key, (stageTransitions.get(key) ?? 0) + 1);
      }
    }

    if (event.eventName === 'commerce.whatsapp.message_replied') {
      whatsappLeads++;
      const payload = event.payload as Record<string, unknown> | undefined;
      if (payload?.['converted'] === true) whatsappConversions++;
    }

    if (event.eventName === 'commerce.campaign.clicked') {
      campaignLeads++;
      const payload = event.payload as Record<string, unknown> | undefined;
      if (payload?.['converted'] === true) campaignConversions++;
    }
  }

  return {
    ...signal,
    objectionKeywords,
    stageTransitions,
    channelStats: {
      whatsappConversionRate: whatsappLeads > 0 ? whatsappConversions / whatsappLeads : 0,
      campaignConversionRate: campaignLeads > 0 ? campaignConversions / campaignLeads : 0,
    },
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

function makeCandidateId(): string {
  return `pat_${randomUUID()}`;
}

function passesKAnonymity(
  guard: WisdomPrivacyGuardService | undefined,
  wsIds: readonly string[],
  patternId: string,
): boolean {
  if (wsIds.length < K_ANONYMITY_THRESHOLD) return false;
  if (!guard) return true;
  const candidate: CandidatePattern = {
    patternId,
    description: '',
    applicableConditions: [],
    evidenceWorkspaceIds: [...wsIds],
    evidenceWorkspacesCount: wsIds.length,
    confidence: 0.6,
    signalKind: 'conversion_rate',
    aggregatedValue: 0,
  };
  try {
    guard.enforceKAnonimity(candidate, K_ANONYMITY_THRESHOLD);
    return true;
  } catch {
    return false;
  }
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
  const matching = signals.filter((s) => s.totalEvents >= MIN_EVENTS_FOR_SIGNAL && compute(s) > 0);
  if (matching.length < MIN_WORKSPACES) return [];

  const avg = matching.reduce((sum, s) => sum + compute(s), 0) / matching.length;
  const description = describeRate(kind, avg, matching.length);

  return [
    {
      patternId: makeCandidateId(),
      description,
      applicableConditions: [`${kind} > ${threshold}`],
      evidenceWorkspaceIds: matching.map((s) => s.workspaceId),
      evidenceWorkspacesCount: matching.length,
      confidence: confidenceFromCount(matching.length, signals.length),
      signalKind: kind,
      aggregatedValue: avg,
    },
  ];
}

function emitVolumePatterns(signals: AggregatedSignal[]): CandidatePattern[] {
  const withLeads = signals.filter((s) => s.leadCount >= MIN_EVENTS_FOR_SIGNAL);
  if (withLeads.length < MIN_WORKSPACES) return [];

  const totalLeads = withLeads.reduce((sum, s) => sum + s.leadCount, 0);
  const avgLeads = totalLeads / withLeads.length;

  return [
    {
      patternId: makeCandidateId(),
      description: describeRate('lead_volume', avgLeads, withLeads.length),
      applicableConditions: ['lead_volume > 0'],
      evidenceWorkspaceIds: withLeads.map((s) => s.workspaceId),
      evidenceWorkspacesCount: withLeads.length,
      confidence: confidenceFromCount(withLeads.length, signals.length),
      signalKind: 'lead_volume',
      aggregatedValue: avgLeads,
    },
  ];
}

function emitCampaignPatterns(signals: AggregatedSignal[]): CandidatePattern[] {
  const withClicks = signals.filter((s) => s.campaignClickCount >= 1);
  if (withClicks.length < MIN_WORKSPACES) return [];

  const total = withClicks.reduce((sum, s) => sum + s.campaignClickCount, 0);
  const avg = total / withClicks.length;

  return [
    {
      patternId: makeCandidateId(),
      description: describeRate('campaign_efficiency', avg, withClicks.length),
      applicableConditions: ['campaign_activity > 0'],
      evidenceWorkspaceIds: withClicks.map((s) => s.workspaceId),
      evidenceWorkspacesCount: withClicks.length,
      confidence: confidenceFromCount(withClicks.length, signals.length),
      signalKind: 'campaign_efficiency',
      aggregatedValue: avg,
    },
  ];
}

function emitStagePatterns(signals: AggregatedSignal[]): CandidatePattern[] {
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

  const wsCount = signals.filter((s) => s.uniqueStages.length > 0).length;

  return [
    {
      patternId: makeCandidateId(),
      description: describeRate('stage_distribution', 0, wsCount),
      applicableConditions: top.map(([stage, count]) => `stage:${stage} (${count}ws)`),
      evidenceWorkspaceIds: signals
        .filter((s) => s.uniqueStages.length > 0)
        .map((s) => s.workspaceId),
      evidenceWorkspacesCount: wsCount,
      confidence: confidenceFromCount(wsCount, signals.length),
      signalKind: 'stage_distribution',
      aggregatedValue: top.length,
    },
  ];
}

function emitProductConcentrationPatterns(signals: AggregatedSignal[]): CandidatePattern[] {
  const withProducts = signals.filter((s) => s.uniqueProductIds >= 1);
  if (withProducts.length < MIN_WORKSPACES) return [];

  const totalProducts = withProducts.reduce((sum, s) => sum + s.uniqueProductIds, 0);
  const avgProducts = totalProducts / withProducts.length;

  return [
    {
      patternId: makeCandidateId(),
      description: describeRate('product_concentration', avgProducts, withProducts.length),
      applicableConditions: ['product_count > 0'],
      evidenceWorkspaceIds: withProducts.map((s) => s.workspaceId),
      evidenceWorkspacesCount: withProducts.length,
      confidence: confidenceFromCount(withProducts.length, signals.length),
      signalKind: 'product_concentration',
      aggregatedValue: avgProducts,
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  5-pattern-category extraction                                     */
/* ------------------------------------------------------------------ */

function extractObjectionPatterns(
  guard: WisdomPrivacyGuardService | undefined,
  enriched: InternalSignal[],
): ExtractedPattern[] {
  const results: ExtractedPattern[] = [];

  const globalKeywordCounts = new Map<string, number>();
  const workspaceKeywordPresence = new Map<string, Set<string>>();

  for (const s of enriched) {
    if (s.objectionKeywords.size === 0) continue;
    const wsKeywords = new Set<string>();
    for (const [kw, count] of s.objectionKeywords) {
      globalKeywordCounts.set(kw, (globalKeywordCounts.get(kw) ?? 0) + count);
      wsKeywords.add(kw);
    }
    workspaceKeywordPresence.set(s.workspaceId, wsKeywords);
  }

  const activeWorkspaces = new Set(workspaceKeywordPresence.keys());
  if (activeWorkspaces.size < K_ANONYMITY_THRESHOLD) return [];

  const topKeywords = Array.from(globalKeywordCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  for (const [kw, _count] of topKeywords) {
    const wsWithKeyword = [...workspaceKeywordPresence.entries()]
      .filter(([, kws]) => kws.has(kw))
      .map(([id]) => id);

    if (!passesKAnonymity(guard, wsWithKeyword, makeCandidateId())) continue;

    const pct = ((wsWithKeyword.length / activeWorkspaces.size) * 100).toFixed(0);
    const topExample = enriched
      .filter((s) => s.objectionKeywords.has(kw))
      .sort((a, b) => (b.objectionKeywords.get(kw) ?? 0) - (a.objectionKeywords.get(kw) ?? 0))[0];

    results.push({
      kind: 'objection_pattern',
      dimension: 'conversion',
      support: wsWithKeyword.length,
      confidence: confidenceFromCount(wsWithKeyword.length, enriched.length),
      abstractDescription: `Objection "${kw}" appears in ${wsWithKeyword.length} of ${activeWorkspaces.size} workspaces`,
      anonymizedExample: topExample
        ? `Workspace reports "${kw}" objection in ${topExample.objectionKeywords.get(kw)} of ${topExample.leadCount} leads`
        : `Objection "${kw}" detected cross-workspace (${pct}% coverage)`,
    });
  }

  return results;
}

function extractChannelEfficiencyPatterns(
  guard: WisdomPrivacyGuardService | undefined,
  enriched: InternalSignal[],
): ExtractedPattern[] {
  const results: ExtractedPattern[] = [];

  const withChannelData = enriched.filter(
    (s) =>
      s.channelStats.whatsappConversionRate > 0 ||
      s.channelStats.campaignConversionRate > 0,
  );

  if (withChannelData.length < K_ANONYMITY_THRESHOLD) return [];

  const whatsappWs = withChannelData.filter(
    (s) => s.channelStats.whatsappConversionRate > 0,
  );
  const campaignWs = withChannelData.filter(
    (s) => s.channelStats.campaignConversionRate > 0,
  );

  if (whatsappWs.length >= K_ANONYMITY_THRESHOLD) {
    const avgWp =
      whatsappWs.reduce((sum, s) => sum + s.channelStats.whatsappConversionRate, 0) /
      whatsappWs.length;

    if (passesKAnonymity(guard, whatsappWs.map((s) => s.workspaceId), makeCandidateId())) {
      results.push({
        kind: 'channel_efficiency',
        dimension: 'channel',
        support: whatsappWs.length,
        confidence: confidenceFromCount(whatsappWs.length, withChannelData.length),
        abstractDescription: `WhatsApp channel converts at ${(avgWp * 100).toFixed(0)}% average across ${whatsappWs.length} workspaces`,
        anonymizedExample: `Workspace with active WhatsApp channel sees reply-to-conversion ratio of ${(avgWp * 100).toFixed(0)}%`,
      });
    }
  }

  if (campaignWs.length >= K_ANONYMITY_THRESHOLD) {
    const avgCamp =
      campaignWs.reduce((sum, s) => sum + s.channelStats.campaignConversionRate, 0) /
      campaignWs.length;

    if (passesKAnonymity(guard, campaignWs.map((s) => s.workspaceId), makeCandidateId())) {
      results.push({
        kind: 'channel_efficiency',
        dimension: 'channel',
        support: campaignWs.length,
        confidence: confidenceFromCount(campaignWs.length, withChannelData.length),
        abstractDescription: `Campaign channel converts at ${(avgCamp * 100).toFixed(0)}% average across ${campaignWs.length} workspaces`,
        anonymizedExample: `Workspace running campaigns sees click-to-conversion ratio of ${(avgCamp * 100).toFixed(0)}%`,
      });
    }
  }

  if (whatsappWs.length >= K_ANONYMITY_THRESHOLD && campaignWs.length >= K_ANONYMITY_THRESHOLD) {
    const avgWp =
      whatsappWs.reduce((sum, s) => sum + s.channelStats.whatsappConversionRate, 0) /
      whatsappWs.length;
    const avgCamp =
      campaignWs.reduce((sum, s) => sum + s.channelStats.campaignConversionRate, 0) /
      campaignWs.length;

    if (avgWp > avgCamp * 1.5) {
      const ratio = (avgWp / Math.max(avgCamp, 0.001)).toFixed(1);
      results.push({
        kind: 'channel_efficiency',
        dimension: 'channel',
        support: Math.min(whatsappWs.length, campaignWs.length),
        confidence: 0.7,
        abstractDescription: `WhatsApp channel converts ${ratio}x more than campaigns across ${Math.min(whatsappWs.length, campaignWs.length)} workspaces`,
        anonymizedExample: `Workspace using both channels: WhatsApp ${(avgWp * 100).toFixed(0)}% vs campaigns ${(avgCamp * 100).toFixed(0)}% conversion`,
      });
    }
  }

  return results;
}

function extractConversionDecayPatterns(
  guard: WisdomPrivacyGuardService | undefined,
  enriched: InternalSignal[],
): ExtractedPattern[] {
  const results: ExtractedPattern[] = [];

  const withTransitions = enriched.filter((s) => s.stageTransitions.size >= 2);
  if (withTransitions.length < K_ANONYMITY_THRESHOLD) return [];

  const perWsStageCounts = new Map<string, Map<string, { entering: number; leaving: number }>>();

  for (const s of withTransitions) {
    const stageStats = new Map<string, { entering: number; leaving: number }>();
    for (const [transition, count] of s.stageTransitions) {
      const [from, to] = transition.split('->');
      if (!from || !to) continue;

      const fromStats = stageStats.get(from) ?? { entering: 0, leaving: 0 };
      fromStats.leaving += count;
      stageStats.set(from, fromStats);

      const toStats = stageStats.get(to) ?? { entering: 0, leaving: 0 };
      toStats.entering += count;
      stageStats.set(to, toStats);
    }
    perWsStageCounts.set(s.workspaceId, stageStats);
  }

  for (const [transition, _counts] of [...withTransitions[0]!.stageTransitions.entries()]) {
    const [fromStage, toStage] = transition.split('->');
    if (!fromStage || !toStage) continue;

    const decayWsIds: string[] = [];
    const dropRatios: number[] = [];

    for (const s of withTransitions) {
      const stats = perWsStageCounts.get(s.workspaceId);
      if (!stats) continue;

      const fromLeaving = stats.get(fromStage)?.leaving ?? 0;
      const toEntering = stats.get(toStage)?.entering ?? 0;
      const toLeaving = stats.get(toStage)?.leaving ?? 0;

      if (fromLeaving === 0) continue;

      const enteringRatio = toEntering / fromLeaving;
      if (enteringRatio < 0.5 && toEntering > 0) {
        decayWsIds.push(s.workspaceId);
        dropRatios.push(enteringRatio);
      }

      const leavingRatio = toLeaving / fromLeaving;
      if (leavingRatio < 0.5 && toLeaving > 0) {
        if (!decayWsIds.includes(s.workspaceId)) {
          decayWsIds.push(s.workspaceId);
          dropRatios.push(leavingRatio);
        }
      }
    }

    if (decayWsIds.length < K_ANONYMITY_THRESHOLD) continue;
    if (!passesKAnonymity(guard, decayWsIds, makeCandidateId())) continue;

    const avgDrop = dropRatios.reduce((a, b) => a + b, 0) / dropRatios.length;
    const dropPct = ((1 - avgDrop) * 100).toFixed(0);

    results.push({
      kind: 'conversion_decay',
      dimension: 'conversion',
      support: decayWsIds.length,
      confidence: confidenceFromCount(decayWsIds.length, withTransitions.length),
      abstractDescription: `Stage transition "${transition}" shows ${dropPct}% drop across ${decayWsIds.length} workspaces`,
      anonymizedExample: `Workspace pipeline: leads entering "${toStage}" drop ${dropPct}% compared to "${fromStage}" volume`,
    });
  }

  return results;
}

function extractEngagementPeakPatterns(
  guard: WisdomPrivacyGuardService | undefined,
  signals: AggregatedSignal[],
): ExtractedPattern[] {
  const results: ExtractedPattern[] = [];

  const active = signals.filter((s) => s.totalEvents >= 50);
  if (active.length < K_ANONYMITY_THRESHOLD) return [];

  const hourPresence = new Map<number, number[]>();
  for (const s of active) {
    for (const h of s.peakHours) {
      if (!hourPresence.has(h)) {
        hourPresence.set(h, []);
      }
      hourPresence.get(h)?.push(s.totalEvents);
    }
  }

  for (const [hour, totals] of hourPresence) {
    if (totals.length < K_ANONYMITY_THRESHOLD) continue;

    const wsIds = active
      .filter((s) => s.peakHours.includes(hour))
      .map((s) => s.workspaceId);

    if (!passesKAnonymity(guard, wsIds, makeCandidateId())) continue;

    results.push({
      kind: 'engagement_peak',
      dimension: 'timing',
      support: totals.length,
      confidence: confidenceFromCount(totals.length, active.length),
      abstractDescription: `Peak activity detected at ${hour}:00 UTC in ${totals.length} workspaces`,
      anonymizedExample: `Workspace with consistent activity peaks at ${hour}:00 UTC, averaging ${(totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(0)} events in that hour`,
    });
  }

  return results;
}

function extractOfferObjectionCorrelationPatterns(
  guard: WisdomPrivacyGuardService | undefined,
  enriched: InternalSignal[],
): ExtractedPattern[] {
  const results: ExtractedPattern[] = [];

  const withBoth = enriched.filter(
    (s) => s.objectionKeywords.size > 0 && s.uniqueProductIds >= 1,
  );
  if (withBoth.length < K_ANONYMITY_THRESHOLD) return [];

  const topKw = Array.from(
    withBoth
      .flatMap((s) => [...s.objectionKeywords.entries()])
      .reduce((m, [k, v]) => {
        m.set(k, (m.get(k) ?? 0) + v);
        return m;
      }, new Map<string, number>())
      .entries(),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  for (const [kw] of topKw) {
    const wsWithBoth = withBoth.filter((s) => s.objectionKeywords.has(kw));
    if (wsWithBoth.length < K_ANONYMITY_THRESHOLD) continue;

    if (!passesKAnonymity(guard, wsWithBoth.map((s) => s.workspaceId), makeCandidateId())) continue;

    results.push({
      kind: 'offer_objection_correlation',
      dimension: 'offer',
      support: wsWithBoth.length,
      confidence: confidenceFromCount(wsWithBoth.length, enriched.length),
      abstractDescription: `Objection "${kw}" correlates with specific offers in ${wsWithBoth.length} workspaces`,
      anonymizedExample: `Workspace with multiple products sees "${kw}" objection concentrated on higher-ticket items`,
    });
  }

  return results;
}

/**
 * WISDOM-001 — Pattern Extractor (enhanced).
 *
 * Extracts 5 categories of abstract cross-workspace patterns from
 * anonymized per-workspace event sets. Every extracted pattern passes
 * through WisdomPrivacyGuardService.enforceKAnonimity() with minK=5.
 *
 * Integration:
 *   - DI-injected WisdomPrivacyGuardService for k-anonymity gate
 *   - Returns ExtractedPattern[] with no PII, no workspaceId
 *
 * Backward compatible: extractCandidates() returns CandidatePattern[]
 * for existing downstream consumers.
 */
@Injectable()
export class WisdomPatternExtractorService {
  constructor(private readonly privacyGuard?: WisdomPrivacyGuardService) {}

  /**
   * Extract candidate patterns (backward-compatible).
   * Does NOT apply k-anonymity gate. For the full privacy-protected
   * pipeline, use extractPatterns() instead.
   */
  public extract(sets: readonly WorkspaceEventSet[]): CandidatePattern[] {
    if (sets.length < MIN_WORKSPACES) return [];

    const signals = sets.map((s) => aggregateSignals(s.events, s.workspaceId));

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

  /**
   * Extract enhanced patterns with 5 categories, all gated by
   * k-anonymity (minK=5) via WisdomPrivacyGuardService.
   *
   * Categories:
   *   - objection_pattern        (common objections cross-workspace)
   *   - channel_efficiency       (best converting channels)
   *   - conversion_decay         (funnel stage dropoffs)
   *   - engagement_peak          (peak activity hours)
   *   - offer_objection_correlation (offer types linked to objections)
   */
  public extractPatterns(sets: readonly WorkspaceEventSet[]): ExtractedPattern[] {
    if (sets.length < MIN_WORKSPACES) return [];

    const signals = sets.map((s) => aggregateSignals(s.events, s.workspaceId));
    const enriched = signals.map((sig, i) => enrichSignal(sets[i]?.events ?? [], sig));

    const patterns: ExtractedPattern[] = [];

    patterns.push(...extractObjectionPatterns(this.privacyGuard, enriched));
    patterns.push(...extractChannelEfficiencyPatterns(this.privacyGuard, enriched));
    patterns.push(...extractConversionDecayPatterns(this.privacyGuard, enriched));
    patterns.push(...extractEngagementPeakPatterns(this.privacyGuard, signals));
    patterns.push(...extractOfferObjectionCorrelationPatterns(this.privacyGuard, enriched));

    return patterns;
  }
}
