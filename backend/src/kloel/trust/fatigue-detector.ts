/**
 * UTP-TRUST-002 — Fatigue Detector
 *
 * Detects lead fatigue: too many messages from the organism in a short
 * window, or repeated objections from the lead.
 *
 * Pure function — stateless. Input: recent events + config. Output: FatigueResult.
 */

import type { TrustEvent, FatigueResult } from './trust.types';

const DEFAULT_WINDOW_MINUTES = 30;
const DEFAULT_MAX_OUTBOUND = 5;
const DEFAULT_MAX_OBJECTIONS = 3;

export interface FatigueConfig {
  readonly windowMinutes: number;
  readonly maxOutboundMessages: number;
  readonly maxObjections: number;
}

export const DEFAULT_FATIGUE_CONFIG: FatigueConfig = {
  windowMinutes: DEFAULT_WINDOW_MINUTES,
  maxOutboundMessages: DEFAULT_MAX_OUTBOUND,
  maxObjections: DEFAULT_MAX_OBJECTIONS,
};

export function detectFatigue(
  recentEvents: readonly TrustEvent[],
  config: Partial<FatigueConfig> = {},
): FatigueResult {
  const cfg: FatigueConfig = { ...DEFAULT_FATIGUE_CONFIG, ...config };
  const windowMs = cfg.windowMinutes * 60 * 1000;
  const now = Date.now();

  const inWindow = recentEvents.filter((e) => {
    const ts = new Date(e.occurredAt).getTime();
    return now - ts <= windowMs;
  });

  const outboundCount = inWindow.filter((e) =>
    e.eventName.startsWith('commerce.whatsapp.message_'),
  ).length;

  const objectionCount = inWindow.filter(
    (e) => e.eventName === 'commerce.lead.objection_raised',
  ).length;

  const outboundRatio = Math.min(1, outboundCount / cfg.maxOutboundMessages);
  const objectionRatio = Math.min(1, objectionCount / cfg.maxObjections);
  const level = Math.max(outboundRatio, objectionRatio);

  const fatigued = outboundCount >= cfg.maxOutboundMessages || objectionCount >= cfg.maxObjections;

  let reason: string;
  if (outboundCount >= cfg.maxOutboundMessages && objectionCount >= cfg.maxObjections) {
    reason = `high outbound (${outboundCount}/${cfg.maxOutboundMessages}) and repeated objections (${objectionCount}/${cfg.maxObjections}) in ${cfg.windowMinutes}min`;
  } else if (outboundCount >= cfg.maxOutboundMessages) {
    reason = `high outbound volume: ${outboundCount} replies in ${cfg.windowMinutes}min`;
  } else if (objectionCount >= cfg.maxObjections) {
    reason = `repeated objections: ${objectionCount} in ${cfg.windowMinutes}min`;
  } else {
    reason = `within acceptable thresholds`;
  }

  return { fatigued, level, reason };
}
