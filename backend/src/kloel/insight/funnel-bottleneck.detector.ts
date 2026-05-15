/**
 * UTP-INSIGHT-001 — Funnel Bottleneck Detector.
 *
 * Identifies the funnel step with the highest drop rate across the
 * canonical commerce pipeline:
 *
 *   lead.created → contacted → replied → qualified →
 *   cart.created → checkout_initiated → payment.approved
 *
 * Part of Camada VII (Strategic Insight Engine), targeting R10:
 * >= 1 strategic insight confirmed per workspace per month.
 */

import {
  FUNNEL_STEP_ORDER,
  FUNNEL_RELEVANT_EVENTS,
  withinWindow,
  type FunnelBottleneckInput,
  type FunnelBottleneckResult,
  type FunnelStepCounts,
} from './insight.types';

const DEFAULT_WINDOW_DAYS = 90;
const MIN_EVENTS_FOR_CONFIDENCE = 3;
const VALUE_ESTIMATE_CENTS: Readonly<Record<string, number>> = {
  'commerce.lead.contacted': 100,
  'commerce.lead.replied': 200,
  'commerce.lead.qualified': 500,
  'commerce.cart.created': 1000,
  'commerce.cart.checkout_initiated': 2000,
  'commerce.payment.approved': 3000,
};

const SUGGESTED_ACTIONS: Readonly<Record<string, string>> = {
  'commerce.lead.contacted':
    'Improve lead outreach: reduce first-response time, verify channel deliverability, automate initial contact',
  'commerce.lead.replied':
    'Refine first-contact message: strengthen value proposition, add personalization tokens, A/B test opening copy',
  'commerce.lead.qualified':
    'Enhance qualification conversation: address objections early, build trust with social proof, tighten qualification criteria',
  'commerce.cart.created':
    'Drive product presentation: highlight key benefits, create urgency with scarcity signals, simplify offer structure',
  'commerce.cart.checkout_initiated':
    'Reduce checkout friction: recover abandoned carts with follow-up, simplify payment form, add trust badges',
  'commerce.payment.approved':
    'Optimize payment experience: address decline reasons, offer alternative payment methods, retry failed charges with smart timing',
};

function dropRate(from: number, to: number): number {
  if (from <= 0) {
    return 0;
  }
  return Math.max(0, (from - to) / from);
}

function buildStepCounts(
  eventCounts: Readonly<Record<string, number>>,
): readonly FunnelStepCounts[] {
  const results: FunnelStepCounts[] = [];
  for (let i = 0; i < FUNNEL_STEP_ORDER.length; i++) {
    const step = FUNNEL_STEP_ORDER[i];
    if (step === undefined) {
      continue;
    }
    const count = eventCounts[step] ?? 0;
    let dropFromPrevious = 0;
    if (i > 0) {
      const prevStep = FUNNEL_STEP_ORDER[i - 1];
      if (prevStep !== undefined) {
        const prevCount = eventCounts[prevStep] ?? 0;
        dropFromPrevious = dropRate(prevCount, count);
      }
    }
    results.push({ step, count, dropFromPrevious });
  }
  return results;
}

function totalEvents(counts: Readonly<Record<string, number>>): number {
  let sum = 0;
  for (const value of Object.values(counts)) {
    sum += value;
  }
  return sum;
}

function computeConfidence(
  stepCounts: readonly FunnelStepCounts[],
  totalCount: number,
  maxDrop: number,
  secondMaxDrop: number,
): number {
  if (totalCount < MIN_EVENTS_FOR_CONFIDENCE) {
    return 0;
  }

  const countFactor = Math.min(1, totalCount / 100);
  const gapFactor = secondMaxDrop > 0 ? Math.min(1, (maxDrop - secondMaxDrop) * 5) : 0.8;
  const stageFactor = stepCounts.filter((s) => s.count > 0).length / FUNNEL_STEP_ORDER.length;

  return Number((countFactor * 0.4 + gapFactor * 0.35 + stageFactor * 0.25).toFixed(2));
}

export function detectFunnelBottleneck(input: FunnelBottleneckInput): FunnelBottleneckResult {
  const { events, workspaceId, nowMs = Date.now(), windowDays = DEFAULT_WINDOW_DAYS } = input;

  const filtered = events.filter(
    (e) =>
      e.workspaceId === workspaceId &&
      FUNNEL_RELEVANT_EVENTS.has(e.eventName) &&
      withinWindow(e.occurredAt, nowMs, windowDays),
  );

  const eventCounts: Record<string, number> = {};
  for (const step of FUNNEL_STEP_ORDER) {
    eventCounts[step] = 0;
  }
  for (const event of filtered) {
    eventCounts[event.eventName] = (eventCounts[event.eventName] ?? 0) + 1;
  }

  const stepCounts = buildStepCounts(eventCounts);

  let maxDrop = 0;
  let bottleneckStep: FunnelBottleneckResult['bottleneckStep'] = 'no_data';
  let secondMaxDrop = 0;

  for (const sc of stepCounts) {
    if (sc.dropFromPrevious > maxDrop) {
      secondMaxDrop = maxDrop;
      maxDrop = sc.dropFromPrevious;
      bottleneckStep = sc.step;
    } else if (sc.dropFromPrevious > secondMaxDrop) {
      secondMaxDrop = sc.dropFromPrevious;
    }
  }

  const totalCount = totalEvents(eventCounts);

  if (maxDrop === 0 && totalCount > 0) {
    bottleneckStep = FUNNEL_STEP_ORDER[FUNNEL_STEP_ORDER.length - 1];
  }

  const confidence = computeConfidence(stepCounts, totalCount, maxDrop, secondMaxDrop);

  let dropCount = 0;
  if (bottleneckStep !== 'no_data') {
    const idx = FUNNEL_STEP_ORDER.indexOf(bottleneckStep);
    if (idx > 0) {
      const prevStep = FUNNEL_STEP_ORDER[idx - 1];
      if (prevStep !== undefined) {
        dropCount = (eventCounts[prevStep] ?? 0) - (eventCounts[bottleneckStep] ?? 0);
      }
    }
  }

  const valuePerDrop =
    bottleneckStep !== 'no_data' ? (VALUE_ESTIMATE_CENTS[bottleneckStep] ?? 0) : 0;

  const financialImpactEstimateCents = dropCount * valuePerDrop * (1 + maxDrop);

  const suggestedAction =
    bottleneckStep !== 'no_data'
      ? (SUGGESTED_ACTIONS[bottleneckStep] ?? 'Investigate funnel performance at this step')
      : 'Insufficient data to identify a bottleneck';

  return {
    workspaceId,
    bottleneckStep,
    dropRate: Number(maxDrop.toFixed(4)),
    eventCount: totalCount,
    suggestedAction,
    financialImpactEstimateCents: Math.round(financialImpactEstimateCents),
    confidence,
    truthMode: 'inferred',
  };
}
