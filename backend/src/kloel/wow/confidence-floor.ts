/**
 * UTP-WOW-005 — WOW Confidence Floor.
 *
 * Blocks low-confidence insights from first-hour delivery.
 * Uses WOW-specific thresholds that are lower than the standard
 * insight confidence floor to accommodate cold-start scenarios
 * (B0.5 — operate without history) while still filtering noise.
 *
 * Pure function — no DI required.
 */

import type { RankedWOWInsight } from './wow.types';
import { WOW_CONFIDENCE_FLOOR_DEFAULT, WOW_CONFIDENCE_FLOOR_PER_KIND } from './wow.types';

export interface ConfidenceVerdict {
  readonly pass: boolean;
  readonly reason?: string;
  readonly effectiveFloor: number;
}

export function wowConfidenceFloor(insight: RankedWOWInsight): ConfidenceVerdict {
  const effectiveFloor =
    WOW_CONFIDENCE_FLOOR_PER_KIND.get(insight.kind) ?? WOW_CONFIDENCE_FLOOR_DEFAULT;

  if (insight.confidence < effectiveFloor) {
    return {
      pass: false,
      reason: `wow confidence ${insight.confidence.toFixed(2)} below floor ${effectiveFloor} for kind ${insight.kind}`,
      effectiveFloor,
    };
  }

  return { pass: true, effectiveFloor };
}

export function filterAboveWOWFloor(insights: readonly RankedWOWInsight[]): {
  readonly passed: readonly RankedWOWInsight[];
  readonly blocked: readonly RankedWOWInsight[];
  readonly blockedReasons: readonly string[];
} {
  const passed: RankedWOWInsight[] = [];
  const blocked: RankedWOWInsight[] = [];
  const blockedReasons: string[] = [];

  for (const insight of insights) {
    const verdict = wowConfidenceFloor(insight);
    if (verdict.pass) {
      passed.push(insight);
    } else {
      blocked.push(insight);
      if (verdict.reason) {
        blockedReasons.push(verdict.reason);
      }
    }
  }

  return { passed, blocked, blockedReasons };
}
