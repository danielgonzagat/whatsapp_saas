/**
 * UTP-OFFER-002 — Promise Strength Detector.
 *
 * Detects when the core promise or headline of the offer fails to convert
 * at expected rates. Compares lead-to-cart conversion rates across
 * different campaigns/creatives to identify weak promise signals.
 */

import type {
  OfferDetectorInput,
  OfferDetectorResult,
  OfferInsight,
} from '../offer.types';
import { OFFER_EVENT_NAMES, withinWindow } from '../offer.types';

const MIN_LEADS_PER_CAMPAIGN = 5;
const WEAK_PROMISE_THRESHOLD = 0.15;
const WINDOW_DAYS = 90;

function extractCampaignRef(
  payload: Readonly<Record<string, unknown>> | undefined,
): string {
  if (!payload) {return 'no_campaign';}
  const ref = payload['campaignId'] ?? payload['adId'] ?? payload['creativeId'];
  return typeof ref === 'string' ? ref : 'no_campaign';
}

export function detectPromiseStrength(
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

  const campaignLeads = new Map<string, number>();
  const campaignCarts = new Map<string, number>();

  for (const event of filtered) {
    if (event.eventName === 'commerce.lead.contacted') {
      const campaign = extractCampaignRef(event.payload);
      campaignLeads.set(campaign, (campaignLeads.get(campaign) ?? 0) + 1);
    } else if (event.eventName === 'commerce.cart.checkout_initiated') {
      const campaign = extractCampaignRef(event.payload);
      campaignCarts.set(campaign, (campaignCarts.get(campaign) ?? 0) + 1);
    }
  }

  for (const [campaign, leadCount] of campaignLeads) {
    if (leadCount < MIN_LEADS_PER_CAMPAIGN) {continue;}
    const cartCount = campaignCarts.get(campaign) ?? 0;
    const conversionRate = cartCount / leadCount;

    if (conversionRate < WEAK_PROMISE_THRESHOLD) {
      insights.push({
        insightId: `offer_ps_${workspaceId}_${campaign}`,
        kind: 'promise_strength',
        description: `campaign ${campaign} converts only ${(conversionRate * 100).toFixed(1)}% of ${leadCount} leads to cart — core promise may be too weak or mismatched`,
        evidence: [
          `campaign ${campaign}: ${leadCount} leads contacted, ${cartCount} carts initiated`,
          `conversion rate: ${(conversionRate * 100).toFixed(1)}%`,
        ],
        impactMultiplicative: Math.max(1.0, 1.5 + (WEAK_PROMISE_THRESHOLD - conversionRate) * 10),
        confidence: Math.min(0.9, 0.4 + (WEAK_PROMISE_THRESHOLD - conversionRate) * 3),
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
