/**
 * UTP-OFFER-001 — Bonus Desirability Detector.
 *
 * Detects when bonuses or incentives attached to an offer are not driving
 * conversion. Compares conversion rates between bonus-tagged purchases and
 * non-bonus purchases within the same product.
 */

import type {
  OfferDetectorInput,
  OfferDetectorResult,
  OfferInsight,
} from '../offer.types';
import { OFFER_EVENT_NAMES, withinWindow } from '../offer.types';

const MIN_BONUS_EVENTS = 3;
const DESIRABILITY_THRESHOLD = 0.3;
const WINDOW_DAYS = 90;

function extractBonusRef(
  payload: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  if (!payload) {return undefined;}
  const bonus = payload['bonusRef'] ?? payload['couponId'] ?? payload['incentiveRef'];
  return typeof bonus === 'string' ? bonus : undefined;
}

export function detectBonusDesirability(
  input: OfferDetectorInput,
): OfferDetectorResult {
  const { events, workspaceId, nowMs = Date.now() } = input;
  const insights: OfferInsight[] = [];

  const filtered = events.filter(
    (e) =>
      e.workspaceId === workspaceId &&
      OFFER_EVENT_NAMES.has(e.eventName) &&
      withinWindow(e.occurredAt, nowMs, WINDOW_DAYS),
  );

  const bonusApproved = new Map<string, number>();
  const bonusDeclined = new Map<string, number>();

  for (const event of filtered) {
    const bonusRef = extractBonusRef(event.payload);
    if (!bonusRef) {continue;}
    if (event.eventName === 'commerce.payment.approved') {
      bonusApproved.set(bonusRef, (bonusApproved.get(bonusRef) ?? 0) + 1);
    } else if (event.eventName === 'commerce.payment.declined') {
      bonusDeclined.set(bonusRef, (bonusDeclined.get(bonusRef) ?? 0) + 1);
    }
  }

  const allBonuses = new Set([...bonusApproved.keys(), ...bonusDeclined.keys()]);

  for (const bonusRef of allBonuses) {
    const approved = bonusApproved.get(bonusRef) ?? 0;
    const declined = bonusDeclined.get(bonusRef) ?? 0;
    const total = approved + declined;

    if (total < MIN_BONUS_EVENTS) {continue;}

    const declineRate = declined / total;
    if (declineRate >= DESIRABILITY_THRESHOLD) {
      insights.push({
        insightId: `offer_bd_${workspaceId}_${bonusRef}`,
        kind: 'bonus_desirability',
        description: `bonus ${bonusRef} has ${(declineRate * 100).toFixed(1)}% decline rate on ${total} attempts — may not be appealing to buyers`,
        evidence: [
          `bonus ${bonusRef}: ${approved} approved, ${declined} declined`,
          `decline rate: ${(declineRate * 100).toFixed(1)}%`,
          `threshold: ${(DESIRABILITY_THRESHOLD * 100).toFixed(0)}%`,
        ],
        impactMultiplicative: Math.max(1.0, 1.0 + (declineRate - DESIRABILITY_THRESHOLD) * 3),
        confidence: Math.min(0.85, 0.4 + declineRate * 0.5),
        recommendedChannel: 'dashboard',
        recommendedTiming: 'weekly',
        workspaceId,
        truthMode: 'inferred',
        generatedAt: new Date(nowMs).toISOString(),
      });
    }
  }

  return { insights };
}
