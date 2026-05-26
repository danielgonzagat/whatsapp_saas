/**
 * UTP-OWNER-CRIT-004 — Risk Tolerance Observer.
 *
 * Observes owner risk appetite from spine events: payment decline
 * handling, deal loss patterns, campaign spending, and handoff
 * frequency. Infers whether the owner is conservative, moderate,
 * or aggressive in their operational risk tolerance.
 *
 * Pure function — takes SpineEventRef[] and returns RiskToleranceObservation[].
 */

import { randomUUID } from 'node:crypto';
import type { SpineEventRef } from '../../mind/mind.types';
import type { ObserverInput, RiskAppetite, RiskToleranceObservation } from '../owner-criterion.types';

const MIN_EVENTS = 3;

function countByEventName(events: readonly SpineEventRef[], name: string): number {
  return events.filter((e) => e.eventName === name).length;
}

function inferRiskAppetite(
  declineRate: number,
  lossRate: number,
  handoffRate: number,
  totalEvents: number,
): RiskAppetite {
  if (totalEvents === 0) {return 'moderate';}

  const aggressionScore =
    (1 - declineRate) * 0.4 +
    (1 - lossRate) * 0.3 +
    (1 - handoffRate) * 0.3;

  if (aggressionScore > 0.75) {return 'aggressive';}
  if (aggressionScore > 0.4) {return 'moderate';}
  return 'conservative';
}

function collectEvidenceSignals(
  declineRate: number,
  lossRate: number,
  handoffRate: number,
): readonly string[] {
  const signals: string[] = [];

  if (declineRate < 0.1) {signals.push('low_payment_decline_tolerance');}
  if (declineRate > 0.3) {signals.push('high_payment_decline_observed');}
  if (lossRate < 0.1) {signals.push('low_deal_loss_tolerance');}
  if (lossRate > 0.3) {signals.push('high_deal_loss_observed');}
  if (handoffRate < 0.15) {signals.push('low_handoff_preference');}
  if (handoffRate > 0.4) {signals.push('high_handoff_preference');}

  return signals;
}

function computeConfidence(totalEvents: number): number {
  if (totalEvents >= 20) {return 0.85;}
  if (totalEvents >= 10) {return 0.7;}
  if (totalEvents >= 5) {return 0.5;}
  return 0.35;
}

/**
 * Observe owner risk tolerance from spine events.
 *
 * Input: ObserverInput
 * Output: RiskToleranceObservation[]
 */
export function observeRiskTolerance(input: ObserverInput): RiskToleranceObservation[] {
  const totalEvents = input.events.length;
  if (totalEvents < MIN_EVENTS) {return [];}

  const declineCount = countByEventName(input.events, 'commerce.payment.declined');
  const lossCount =
    countByEventName(input.events, 'commerce.crm.deal_lost') +
    countByEventName(input.events, 'commerce.lead.lost');
  const handoffCount = countByEventName(
    input.events,
    'commerce.whatsapp.handoff_to_human',
  );

  const totalTerminal =
    declineCount + lossCount + handoffCount +
    countByEventName(input.events, 'commerce.payment.approved') +
    countByEventName(input.events, 'commerce.crm.deal_won');

  const declineRate = totalTerminal > 0 ? declineCount / totalTerminal : 0;
  const lossRate = totalTerminal > 0 ? lossCount / totalTerminal : 0;
  const handoffRate = totalTerminal > 0 ? handoffCount / totalTerminal : 0;

  const appetite = inferRiskAppetite(declineRate, lossRate, handoffRate, totalEvents);

  return [
    {
      observationId: `risk_${randomUUID()}`,
      workspaceId: input.workspaceId,
      riskAppetite: appetite,
      confidence: computeConfidence(totalEvents),
      evidenceSignals: collectEvidenceSignals(declineRate, lossRate, handoffRate),
      observedAt: new Date(input.nowMs).toISOString(),
      evidenceEventIds: input.events.map((e) => e.eventId),
    },
  ];
}
