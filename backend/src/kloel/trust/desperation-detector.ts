/**
 * UTP-TRUST-003 — Desperation Detector
 *
 * Detects discount escalation or promise inflation in the organism's
 * outbound messages — patterns that signal desperation and erode trust.
 *
 * Pure function — stateless. Input: recent outbound message payloads.
 * Output: DesperationResult.
 */

import type { TrustEvent, DesperationResult } from './trust.types';

const DISCOUNT_ESCALATION_KEYWORDS = [
  'desconto',
  'discount',
  'mais barato',
  'preço especial',
  'oferta imperdível',
  'última chance',
  'preço reduzido',
  'condição exclusiva',
];

const PROMISE_INFLATION_KEYWORDS = [
  'garantimos',
  'garantido',
  'com certeza',
  '100%',
  'resultado garantido',
  'fatura em',
  'em 24h',
  'imediatamente',
];

export interface DesperationConfig {
  readonly maxRecentMessages: number;
  readonly discountEscalationThreshold: number;
  readonly promiseInflationThreshold: number;
}

const DEFAULT_DESPERATION_CONFIG: DesperationConfig = {
  maxRecentMessages: 10,
  discountEscalationThreshold: 0.3,
  promiseInflationThreshold: 0.25,
};

export function detectDesperation(
  recentOutboundEvents: readonly TrustEvent[],
  config: Partial<DesperationConfig> = {},
): DesperationResult {
  const cfg: DesperationConfig = { ...DEFAULT_DESPERATION_CONFIG, ...config };
  const sample = recentOutboundEvents.slice(-cfg.maxRecentMessages);

  if (sample.length === 0) {
    return { desperate: false, level: 0, reason: 'no recent outbound messages' };
  }

  let discountHits = 0;
  let promiseHits = 0;

  for (const ev of sample) {
    const text = extractMessageText(ev);
    if (!text) continue;

    const lower = text.toLowerCase();
    for (const kw of DISCOUNT_ESCALATION_KEYWORDS) {
      if (lower.includes(kw)) {
        discountHits += 1;
        break;
      }
    }
    for (const kw of PROMISE_INFLATION_KEYWORDS) {
      if (lower.includes(kw)) {
        promiseHits += 1;
        break;
      }
    }
  }

  const discountRatio = discountHits / sample.length;
  const promiseRatio = promiseHits / sample.length;
  const level = Math.min(1, (discountRatio / cfg.discountEscalationThreshold + promiseRatio / cfg.promiseInflationThreshold) / 2);

  const desperate = discountRatio >= cfg.discountEscalationThreshold || promiseRatio >= cfg.promiseInflationThreshold;

  let reason: string;
  if (discountRatio >= cfg.discountEscalationThreshold && promiseRatio >= cfg.promiseInflationThreshold) {
    reason = `discount escalation (${(discountRatio * 100).toFixed(0)}%) and promise inflation (${(promiseRatio * 100).toFixed(0)}%) detected`;
  } else if (discountRatio >= cfg.discountEscalationThreshold) {
    reason = `discount escalation: ${discountHits}/${sample.length} messages with discount language`;
  } else if (promiseRatio >= cfg.promiseInflationThreshold) {
    reason = `promise inflation: ${promiseHits}/${sample.length} messages with inflated promises`;
  } else {
    reason = `message patterns within acceptable bounds`;
  }

  return { desperate, level, reason };
}

function extractMessageText(ev: TrustEvent): string | undefined {
  const p = ev.payload;
  if (!p) return undefined;
  if (typeof p['messageBody'] === 'string') return p['messageBody'] as string;
  if (typeof p['body'] === 'string') return p['body'] as string;
  if (typeof p['text'] === 'string') return p['text'] as string;
  return undefined;
}
