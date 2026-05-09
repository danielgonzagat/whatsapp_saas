import { MIND_DECISION_TYPES } from './mind-decision-catalog';

export const LEGACY_DECISION_TYPES = [
  'cia_aggressiveness',
  'audio_vs_text',
  'tom',
  'cupom',
] as const;

export const KNOWN_DECISION_TYPES = [...MIND_DECISION_TYPES] as const;

export const SUPPORTED_DECISION_TYPES = [...MIND_DECISION_TYPES, ...LEGACY_DECISION_TYPES] as const;

export const TONE_OPTIONS = [
  'DIRECT',
  'CONSULTIVE',
  'FRIENDLY',
  'EMPATHETIC',
  'CASUAL',
  'EDUCATIVE',
  'URGENT',
  'TECHNICAL',
  'AGGRESSIVE',
] as const;

export function resolveToneBaseline(
  repliedRate: number,
  soldRate: number,
  _channel: string,
): string {
  if (repliedRate >= 0.4) return 'FRIENDLY';
  if (soldRate >= 0.15) return 'CONSULTIVE';
  return 'DIRECT';
}

export function resolveAudioBaseline(_channel: string, audioRatio: number): string {
  if (audioRatio >= 0.2) return 'audio';
  return 'text';
}

export function resolveMessageFormatBaseline(channel: string, supports: string[]): string {
  if (channel === 'email' && supports.includes('html_rich')) return 'html_rich';
  if (supports.includes('audio') && (channel === 'whatsapp' || channel === 'instagram')) {
    return 'audio';
  }
  return supports.includes('text') ? 'text' : (supports[0] ?? 'text');
}

export function resolveObjectionResponseBaseline(concept: string, priceBand: string): string {
  const normalized = `${concept} ${priceBand}`.toLowerCase();
  if (normalized.includes('confian') || normalized.includes('trust')) return 'social_proof';
  if (normalized.includes('risco') || normalized.includes('garantia')) return 'guarantee';
  if (normalized.includes('premium') || normalized.includes('over_')) return 'direct_comparison';
  return 'value_focus';
}

export function resolveCouponBaseline(priceBand: string, soldRate: number): string {
  const highBands = new Set(['over_300', 'over_500', 'over_1000']);
  if (priceBand === 'over_1000' && soldRate < 0.08) return 'coupon_15';
  if (highBands.has(priceBand) && soldRate < 0.1) return 'coupon_10';
  if (priceBand === 'over_100' && soldRate < 0.05) return 'coupon_5';
  return 'no_coupon';
}

export function resolveAggressivenessBaseline(
  soldRate: number,
  repliedRate: number,
  revenuePerSignal: number,
): string {
  if (soldRate >= 0.3 || revenuePerSignal >= 150) return 'HIGH';
  if (soldRate >= 0.15 || repliedRate >= 0.4) return 'MEDIUM';
  return 'LOW';
}

export function messageTemplate(payload: Record<string, unknown>): string {
  const type = toStableString(payload.messageType ?? 'TEXT').toLowerCase();
  if (type.includes('audio') || type.includes('voice')) return 'audio';
  if (type.includes('template')) return 'template';
  return 'text';
}

export function resolveHumanTransferBaseline(
  _channel: string,
  _concept: string,
  ticketRisk: number,
): string {
  if (ticketRisk >= 0.7) return 'transfer_now';
  if (ticketRisk >= 0.4) return 'transfer_after_next_reply';
  return 'continue_ai';
}

export function resolveChannelChoiceBaseline(
  availableChannels: string[],
  _segment?: string,
): string {
  const priority = ['whatsapp', 'instagram', 'messenger', 'email', 'sms'];
  for (const channel of priority) {
    if (availableChannels.includes(channel)) return channel;
  }
  return availableChannels[0] ?? 'whatsapp';
}

export function resolveProductOfferBaseline(
  segment: string,
  _concept: string,
  priceBand: string,
): string {
  if (segment === 'premium') return 'premium_product';
  if (segment === 'new_lead' || segment === 'cold') return 'entry_product';
  const highBands = new Set(['over_300', 'over_500', 'over_1000']);
  if (highBands.has(priceBand)) return 'highest_margin';
  return 'top_seller';
}

export function resolveBroadcastWindowBaseline(
  _channel: string,
  _weekday: string,
  fatigue: number,
): string {
  if (fatigue >= 0.8) return 'pause';
  return 'tomorrow_9h';
}

export function resolveAdAlertActionBaseline(_metric: string, threshold: string): string {
  if (threshold === 'critical') return 'suggest_pause';
  if (threshold === 'low') return 'suggest_budget_down';
  return 'alert_only';
}

export function toStableString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString();
  }
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}
