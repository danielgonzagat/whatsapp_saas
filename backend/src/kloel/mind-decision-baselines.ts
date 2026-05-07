export const KNOWN_DECISION_TYPES = [
  'followup_timing',
  'send_window',
  'offer_discount',
  'cia_aggressiveness',
  'audio_vs_text',
  'tom',
  'cupom',
] as const;

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
  channel: string,
): string {
  if (channel === 'whatsapp' && repliedRate >= 0.4) return 'FRIENDLY';
  if (soldRate >= 0.15) return 'CONSULTIVE';
  return 'DIRECT';
}

export function resolveAudioBaseline(channel: string, audioRatio: number): string {
  if (channel === 'whatsapp' && audioRatio >= 0.2) return 'audio';
  return 'text';
}

export function resolveCouponBaseline(priceBand: string, soldRate: number): string {
  const highBands = new Set(['over_300', 'over_500', 'over_1000']);
  if (highBands.has(priceBand) && soldRate < 0.1) return 'offer_coupon';
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

export function toStableString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return value.toString();
  }
  if (value === null || value === undefined) return '';
  return JSON.stringify(value);
}
