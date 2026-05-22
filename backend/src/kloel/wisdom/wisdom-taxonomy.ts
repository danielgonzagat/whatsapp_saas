/**
 * WISDOM-004 — Pattern Taxonomy.
 *
 * Assigns structured tags to patterns: verticalHint, ticketHint,
 * stageHint, channelHint. Pure functions — stateless mappers
 * that derive tags from the pattern's signalKind and conditions.
 */

import type { CandidatePattern, PatternTaxonomy, SignalKind } from './wisdom.types';

const VERTICAL_HINTS: ReadonlyMap<SignalKind, string> = new Map([
  ['conversion_rate', 'sales'],
  ['reply_rate', 'engagement'],
  ['refund_rate', 'financial'],
  ['handoff_rate', 'support'],
  ['deal_close_rate', 'sales'],
  ['lead_volume', 'marketing'],
  ['campaign_efficiency', 'marketing'],
  ['peak_activity', 'operations'],
  ['stage_distribution', 'sales'],
  ['product_concentration', 'product'],
]);

const TICKET_HINTS: ReadonlyMap<SignalKind, string> = new Map([
  ['conversion_rate', 'all'],
  ['reply_rate', 'all'],
  ['refund_rate', 'all'],
  ['handoff_rate', 'all'],
  ['deal_close_rate', 'high'],
  ['lead_volume', 'all'],
  ['campaign_efficiency', 'medium'],
  ['peak_activity', 'all'],
  ['stage_distribution', 'all'],
  ['product_concentration', 'low'],
]);

const STAGE_HINTS: ReadonlyMap<SignalKind, string> = new Map([
  ['conversion_rate', 'tracao'],
  ['reply_rate', 'validacao'],
  ['refund_rate', 'maturidade'],
  ['handoff_rate', 'crescimento'],
  ['deal_close_rate', 'crescimento'],
  ['lead_volume', 'validacao'],
  ['campaign_efficiency', 'crescimento'],
  ['peak_activity', 'crescimento'],
  ['stage_distribution', 'tracao'],
  ['product_concentration', 'otimizacao'],
]);

const CHANNEL_HINTS: ReadonlyMap<SignalKind, string> = new Map([
  ['conversion_rate', 'whatsapp'],
  ['reply_rate', 'whatsapp'],
  ['refund_rate', 'checkout'],
  ['handoff_rate', 'whatsapp'],
  ['deal_close_rate', 'crm'],
  ['lead_volume', 'whatsapp'],
  ['campaign_efficiency', 'campaign'],
  ['peak_activity', 'whatsapp'],
  ['stage_distribution', 'crm'],
  ['product_concentration', 'checkout'],
]);

/**
 * Derive taxonomy tags from a candidate pattern's signalKind
 * and applicable conditions. Returns a PatternTaxonomy with
 * hints for filtering and relevance matching.
 */
export function deriveTaxonomy(pattern: CandidatePattern): PatternTaxonomy {
  const kind = pattern.signalKind;

  return {
    verticalHint: VERTICAL_HINTS.get(kind),
    tickethint: TICKET_HINTS.get(kind),
    stageHint: STAGE_HINTS.get(kind),
    channelHint: CHANNEL_HINTS.get(kind),
  };
}

/**
 * Derive taxonomy from a SignalKind directly (for use when
 * only the kind is known, not the full pattern).
 */
export function taxonomyForSignalKind(kind: SignalKind): PatternTaxonomy {
  return {
    verticalHint: VERTICAL_HINTS.get(kind),
    tickethint: TICKET_HINTS.get(kind),
    stageHint: STAGE_HINTS.get(kind),
    channelHint: CHANNEL_HINTS.get(kind),
  };
}

/**
 * All supported vertical hint values.
 */
export const ALL_VERTICAL_HINTS: readonly string[] = [
  'sales',
  'engagement',
  'financial',
  'support',
  'marketing',
  'operations',
  'product',
];

/**
 * All supported ticket hint values.
 */
export const ALL_TICKET_HINTS: readonly string[] = ['low', 'medium', 'high', 'all'];

/**
 * All supported stage hint values.
 */
export const ALL_STAGE_HINTS: readonly string[] = [
  'validacao',
  'tracao',
  'crescimento',
  'maturidade',
  'otimizacao',
];

/**
 * All supported channel hint values.
 */
export const ALL_CHANNEL_HINTS: readonly string[] = [
  'whatsapp',
  'checkout',
  'crm',
  'campaign',
];
