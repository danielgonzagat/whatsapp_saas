/**
 * UTP-OWNER-CRIT-005 — Ethical Line Observer.
 *
 * Observes owner ethical boundaries from spine events: KYC rejections,
 * consent revocations, policy violations, regulated content flags,
 * and legitimate operations that demonstrate ethical preferences.
 *
 * Pure function — takes SpineEventRef[] and returns EthicalLineObservation[].
 */

import { randomUUID } from 'node:crypto';
import type { SpineEventRef } from '../../mind/mind.types';
import type {
  EthicalBoundaryType,
  EthicalLineObservation,
  ObserverInput,
} from '../owner-criterion.types';

const MIN_EVENTS = 1;

interface BoundarySignal {
  readonly boundaryType: EthicalBoundaryType;
  readonly description: string;
  readonly context: string;
  readonly eventId: string;
}

function detectComplianceBoundaries(events: readonly SpineEventRef[]): BoundarySignal[] {
  const signals: BoundarySignal[] = [];

  for (const e of events) {
    if (e.eventName === 'commerce.kyc.rejected') {
      signals.push({
        boundaryType: 'compliance_hard',
        description: 'owner rejects documents that fail KYC validation',
        context: 'kyc_verification',
        eventId: e.eventId,
      });
    }

    if (e.eventName === 'legitimacy.consent_revoked') {
      signals.push({
        boundaryType: 'compliance_soft',
        description: 'owner respects consent revocation promptly',
        context: 'privacy_consent',
        eventId: e.eventId,
      });
    }

    if (e.eventName === 'legitimacy.policy_violation_detected') {
      signals.push({
        boundaryType: 'compliance_soft',
        description: 'owner has active policy violation detection',
        context: 'policy_enforcement',
        eventId: e.eventId,
      });
    }

    if (e.eventName === 'legitimacy.regulated_content_flagged') {
      signals.push({
        boundaryType: 'reputation',
        description: 'owner monitors for regulated content in communications',
        context: 'content_moderation',
        eventId: e.eventId,
      });
    }

    if (e.eventName === 'legitimacy.legal_consult_recommended') {
      signals.push({
        boundaryType: 'compliance_hard',
        description: 'owner defers to human legal consultation on ambiguous cases',
        context: 'legal_review',
        eventId: e.eventId,
      });
    }
  }

  return signals;
}

function detectPrivacyBoundaries(events: readonly SpineEventRef[]): BoundarySignal[] {
  const signals: BoundarySignal[] = [];

  for (const e of events) {
    if (e.eventName === 'commerce.lead.lost') {
      const payload = e.payload as Record<string, unknown> | undefined;
      if (payload?.['reason'] === 'privacy_request') {
        signals.push({
          boundaryType: 'data_privacy',
          description: 'owner deletes leads on privacy request rather than retaining',
          context: 'data_handling',
          eventId: e.eventId,
        });
      }
    }
  }

  return signals;
}

function detectCustomerProtectionBoundaries(
  events: readonly SpineEventRef[],
): BoundarySignal[] {
  const signals: BoundarySignal[] = [];

  for (const e of events) {
    if (e.eventName === 'commerce.payment.refunded') {
      signals.push({
        boundaryType: 'customer_protection',
        description: 'owner processes refunds for customer protection',
        context: 'payment_resolution',
        eventId: e.eventId,
      });
    }

    if (e.eventName === 'commerce.whatsapp.handoff_to_human') {
      const payload = e.payload as Record<string, unknown> | undefined;
      if (payload?.['reason'] === 'sensitive_topic') {
        signals.push({
          boundaryType: 'customer_protection',
          description: 'owner escalates sensitive conversations to human handlers',
          context: 'conversation_handling',
          eventId: e.eventId,
        });
      }
    }
  }

  return signals;
}

function groupByBoundaryType(
  signals: readonly BoundarySignal[],
  workspaceId: string,
  nowMs: number,
): EthicalLineObservation[] {
  const groups = new Map<EthicalBoundaryType, BoundarySignal[]>();

  for (const s of signals) {
    const existing = groups.get(s.boundaryType) ?? [];
    existing.push(s);
    groups.set(s.boundaryType, existing);
  }

  const observations: EthicalLineObservation[] = [];
  for (const [boundaryType, groupSignals] of groups) {
    const first = groupSignals[0]!;
    observations.push({
      observationId: `eth_${randomUUID()}`,
      workspaceId,
      boundaryType,
      boundaryDescription: first.description,
      triggerContext: first.context,
      confidence: Math.min(0.95, 0.4 + groupSignals.length * 0.15),
      observedAt: new Date(nowMs).toISOString(),
      evidenceEventIds: groupSignals.map((s) => s.eventId),
    });
  }

  return observations;
}

/**
 * Observe owner ethical boundaries from spine events.
 *
 * Input: ObserverInput
 * Output: EthicalLineObservation[]
 */
export function observeEthicalLines(input: ObserverInput): EthicalLineObservation[] {
  const signals: BoundarySignal[] = [
    ...detectComplianceBoundaries(input.events),
    ...detectPrivacyBoundaries(input.events),
    ...detectCustomerProtectionBoundaries(input.events),
  ];

  if (signals.length < MIN_EVENTS) {return [];}

  return groupByBoundaryType(signals, input.workspaceId, input.nowMs);
}
