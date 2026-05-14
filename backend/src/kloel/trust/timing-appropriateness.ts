/**
 * UTP-TRUST-004 — Timing Appropriateness
 *
 * Evaluates whether sending the next message is appropriate given
 * the local hour and the user's typical reply window.
 *
 * Pure function — stateless. Input: localHour, userReplyWindow. Output: TimingResult.
 */

import type { TimingResult } from './trust.types';

const DEFAULT_QUIET_START = 22;
const DEFAULT_QUIET_END = 7;

export interface TimingConfig {
  readonly quietStartHour: number;
  readonly quietEndHour: number;
  readonly typicalReplyWindowStart?: number;
  readonly typicalReplyWindowEnd?: number;
}

export const DEFAULT_TIMING_CONFIG: TimingConfig = {
  quietStartHour: DEFAULT_QUIET_START,
  quietEndHour: DEFAULT_QUIET_END,
};

export function evaluateTiming(
  localHour: number,
  config: Partial<TimingConfig> = {},
): TimingResult {
  const cfg: TimingConfig = { ...DEFAULT_TIMING_CONFIG, ...config };

  const isQuietHours =
    localHour >= cfg.quietStartHour || localHour < cfg.quietEndHour;

  const hasTypicalWindow =
    cfg.typicalReplyWindowStart !== undefined &&
    cfg.typicalReplyWindowEnd !== undefined;

  let peakWindow = false;
  if (hasTypicalWindow) {
    peakWindow =
      localHour >= cfg.typicalReplyWindowStart! &&
      localHour < cfg.typicalReplyWindowEnd!;
  }

  const appropriate = !isQuietHours;

  let reason: string;
  if (isQuietHours) {
    reason = `quiet hours (${cfg.quietStartHour}:00–${cfg.quietEndHour}:00) — defer message`;
  } else if (peakWindow) {
    reason = `within peak reply window — optimal timing`;
  } else if (hasTypicalWindow) {
    reason = `outside peak window but acceptable`;
  } else {
    reason = `acceptable hour — no reply window configured`;
  }

  return {
    appropriate,
    localHour,
    ...(hasTypicalWindow ? { peakWindow } : {}),
    reason,
  };
}
