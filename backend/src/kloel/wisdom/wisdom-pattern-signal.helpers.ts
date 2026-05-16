import { randomUUID } from 'node:crypto';
import type { SpineEventRef } from '../mind/mind.types';
import type { WisdomPrivacyGuardService } from './wisdom-privacy-guard.service';
import type { AggregatedSignal, CandidatePattern, SignalKind } from './wisdom.types';
const MIN_EVENTS_FOR_SIGNAL = 10;
export const MIN_WORKSPACES = 2;
export const K_ANONYMITY_THRESHOLD = 5;
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
export interface InternalSignal extends AggregatedSignal {
  readonly objectionKeywords: ReadonlyMap<string, number>;
  readonly stageTransitions: ReadonlyMap<string, number>;
  readonly channelStats: {
    readonly whatsappConversionRate: number;
    readonly campaignConversionRate: number;
  };
}
export function aggregateSignals(events: readonly SpineEventRef[], workspaceId: string): AggregatedSignal {
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
export function enrichSignal(events: readonly SpineEventRef[], signal: AggregatedSignal): InternalSignal {
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
export function conversionRate(s: AggregatedSignal): number {
  if (s.leadCount === 0) return 0;
  return s.conversionCount / s.leadCount;
}
export function replyRate(s: AggregatedSignal): number {
  if (s.totalEvents === 0) return 0;
  return s.replyCount / s.totalEvents;
}
export function refundRate(s: AggregatedSignal): number {
  if (s.paymentCount === 0) return 0;
  return s.refundCount / s.paymentCount;
}
export function handoffRate(s: AggregatedSignal): number {
  if (s.totalEvents === 0) return 0;
  return s.handoffCount / s.totalEvents;
}
export function dealCloseRate(s: AggregatedSignal): number {
  const total = s.dealWonCount + s.dealLostCount;
  if (total === 0) return 0;
  return s.dealWonCount / total;
}
export function confidenceFromCount(workspacesWithSignal: number, totalWorkspaces: number): number {
  if (totalWorkspaces === 0) return 0;
  const ratio = workspacesWithSignal / totalWorkspaces;
  return Math.min(0.95, 0.4 + ratio * 0.55);
}
export function makeCandidateId(): string {
  return `pat_${randomUUID()}`;
}
export function passesKAnonymity(
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
export function describeRate(
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
export function emitRatePatterns(
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
export function emitVolumePatterns(signals: AggregatedSignal[]): CandidatePattern[] {
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
export function emitCampaignPatterns(signals: AggregatedSignal[]): CandidatePattern[] {
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
export function emitStagePatterns(signals: AggregatedSignal[]): CandidatePattern[] {
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
export function emitProductConcentrationPatterns(signals: AggregatedSignal[]): CandidatePattern[] {
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
