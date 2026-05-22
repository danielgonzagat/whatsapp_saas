/**
 * UTP-OFFER-004 — Positioning Mismatch Detector.
 *
 * Detects when the market perceives the offer differently from how it's
 * positioned. Signals based on objection patterns vs intended positioning,
 * refund reasons, and lead qualification alignment.
 */

import type {
  OfferDetectorInput,
  OfferDetectorResult,
  OfferInsight,
} from '../offer.types';
import { OFFER_EVENT_NAMES, withinWindow } from '../offer.types';

const MIN_OBJECTIONS = 4;
const MIN_LEADS = 10;
const MISMATCH_RATIO_THRESHOLD = 0.4;
const WINDOW_DAYS = 90;

function extractObjectionKind(
  payload: Readonly<Record<string, unknown>> | undefined,
): string | undefined {
  if (!payload) return undefined;
  const kind = payload['kind'] ?? payload['objectionKind'];
  return typeof kind === 'string' ? kind : undefined;
}

export function detectPositioningMismatch(
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

  const objectionKinds = new Map<string, number>();
  let totalObjections = 0;

  for (const event of filtered) {
    if (event.eventName === 'commerce.lead.objection_raised') {
      const kind = extractObjectionKind(event.payload);
      if (kind) {
        objectionKinds.set(kind, (objectionKinds.get(kind) ?? 0) + 1);
        totalObjections++;
      }
    }
  }

  if (totalObjections < MIN_OBJECTIONS) return { insights: [] };

  const dominantCategory = 'price';
  const dominantCount = objectionKinds.get(dominantCategory) ?? 0;

  if (objectionKinds.has('price') && objectionKinds.has('trust')) {
    const priceCount = objectionKinds.get('price') ?? 0;
    const trustCount = objectionKinds.get('trust') ?? 0;
    const trustRatio = trustCount / totalObjections;

    if (trustRatio >= MISMATCH_RATIO_THRESHOLD) {
      insights.push({
        insightId: `offer_pm_trust_${workspaceId}`,
        kind: 'positioning_mismatch',
        description: `${(trustRatio * 100).toFixed(0)}% of objections are trust-related (${trustCount}/${totalObjections}) alongside ${priceCount} price objections — positioning may not convey credibility`,
        evidence: [
          `trust objections: ${trustCount}/${totalObjections} (${(trustRatio * 100).toFixed(1)}%)`,
          `price objections: ${priceCount}/${totalObjections}`,
        ],
        impactMultiplicative: Math.max(1.0, 1.0 + trustRatio * 3),
        confidence: Math.min(0.85, 0.4 + trustRatio),
        recommendedChannel: 'dashboard',
        recommendedTiming: 'weekly',
        workspaceId,
        truthMode: 'inferred',
        generatedAt: new Date(nowMs).toISOString(),
      });
    }
  }

  const lostCount = filtered.filter(
    (e) => e.eventName === 'commerce.lead.lost',
  ).length;
  const leadCount = filtered.filter(
    (e) => e.eventName === 'commerce.lead.created',
  ).length;

  if (leadCount >= MIN_LEADS && lostCount > 0) {
    const lostRatio = lostCount / leadCount;
    if (lostRatio >= MISMATCH_RATIO_THRESHOLD) {
      const dominantKind = dominantCount > 0 ? dominantCategory : 'unknown';
      insights.push({
        insightId: `offer_pm_lost_${workspaceId}`,
        kind: 'positioning_mismatch',
        description: `${(lostRatio * 100).toFixed(1)}% of leads are lost (${lostCount}/${leadCount}) — positioning may be attracting wrong-fit leads`,
        evidence: [
          `lost leads: ${lostCount}/${leadCount} (${(lostRatio * 100).toFixed(1)}%)`,
          `dominant objection: ${dominantKind}`,
        ],
        impactMultiplicative: Math.max(1.0, 1.0 + lostRatio * 2.5),
        confidence: Math.min(0.8, 0.35 + lostRatio * 0.8),
        recommendedChannel: 'whatsapp',
        recommendedTiming: 'now',
        workspaceId,
        truthMode: 'inferred',
        generatedAt: new Date(nowMs).toISOString(),
      });
    }
  }

  return { insights };
}
