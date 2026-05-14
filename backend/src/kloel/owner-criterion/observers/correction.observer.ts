/**
 * UTP-OWNER-CRIT-002 — Correction Observer.
 *
 * Observes owner corrections to system outputs: message rewrites,
 * classification fixes, action reversals, and policy adjustments.
 *
 * Pure function — takes SpineEventRef[] and returns CorrectionObservation[].
 */

import { randomUUID } from 'node:crypto';
import type { SpineEventRef } from '../../mind/mind.types';
import type { CorrectionKind, CorrectionObservation, ObserverInput } from '../owner-criterion.types';

const MIN_CORRECTIONS = 2;

interface CorrectionSignal {
  readonly correctionKind: CorrectionKind;
  readonly correctedTarget: string;
  readonly eventId: string;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>> | undefined;
}

function extractMessageRewrites(events: readonly SpineEventRef[]): CorrectionSignal[] {
  return events
    .filter((e) => e.eventName === 'commerce.whatsapp.message_replied')
    .map((e) => ({
      correctionKind: 'message_rewrite' as CorrectionKind,
      correctedTarget: 'auto_reply',
      eventId: e.eventId,
      occurredAt: e.occurredAt,
      payload: e.payload,
    }));
}

function extractClassificationFixes(events: readonly SpineEventRef[]): CorrectionSignal[] {
  return events
    .filter((e) => e.eventName === 'commerce.lead.objection_raised')
    .filter((e) => {
      const payload = e.payload as Record<string, unknown> | undefined;
      return payload?.['causedByEventId'] !== undefined;
    })
    .map((e) => ({
      correctionKind: 'classification_fix' as CorrectionKind,
      correctedTarget: 'lead_classification',
      eventId: e.eventId,
      occurredAt: e.occurredAt,
      payload: e.payload,
    }));
}

function extractActionReversals(events: readonly SpineEventRef[]): CorrectionSignal[] {
  return events
    .filter(
      (e) => e.eventName === 'cognition.belief_updated' &&
        (e.payload as Record<string, unknown> | undefined)?.['updateKind'] === 'reversal',
    )
    .map((e) => ({
      correctionKind: 'action_reversal' as CorrectionKind,
      correctedTarget: 'belief',
      eventId: e.eventId,
      occurredAt: e.occurredAt,
      payload: e.payload,
    }));
}

function describeCorrection(
  _kind: CorrectionKind,
  signalCount: number,
): { readonly originalOutput: string; readonly correctedOutput: string } {
  return {
    originalOutput: `system output (${signalCount} instances detected)`,
    correctedOutput: `owner-corrected output (${signalCount} instances applied)`,
  };
}

function computeConfidence(signalCount: number): number {
  if (signalCount >= 10) return 0.9;
  if (signalCount >= 5) return 0.75;
  if (signalCount >= 3) return 0.6;
  return 0.4;
}

/**
 * Observe owner corrections from spine events.
 *
 * Input: ObserverInput
 * Output: CorrectionObservation[] — one per detected correction kind
 */
export function observeCorrections(input: ObserverInput): CorrectionObservation[] {
  const observations: CorrectionObservation[] = [];

  const rewrites = extractMessageRewrites(input.events);
  const classificationFixes = extractClassificationFixes(input.events);
  const reversals = extractActionReversals(input.events);

  if (rewrites.length >= MIN_CORRECTIONS) {
    const desc = describeCorrection('message_rewrite', rewrites.length);
    observations.push({
      observationId: `cor_${randomUUID()}`,
      workspaceId: input.workspaceId,
      correctedTarget: 'auto_reply',
      originalOutput: desc.originalOutput,
      correctedOutput: desc.correctedOutput,
      correctionKind: 'message_rewrite',
      observedAt: new Date(input.nowMs).toISOString(),
      evidenceEventIds: rewrites.map((s) => s.eventId),
      confidence: computeConfidence(rewrites.length),
    });
  }

  if (classificationFixes.length >= MIN_CORRECTIONS) {
    const desc = describeCorrection('classification_fix', classificationFixes.length);
    observations.push({
      observationId: `cor_${randomUUID()}`,
      workspaceId: input.workspaceId,
      correctedTarget: 'lead_classification',
      originalOutput: desc.originalOutput,
      correctedOutput: desc.correctedOutput,
      correctionKind: 'classification_fix',
      observedAt: new Date(input.nowMs).toISOString(),
      evidenceEventIds: classificationFixes.map((s) => s.eventId),
      confidence: computeConfidence(classificationFixes.length),
    });
  }

  if (reversals.length >= MIN_CORRECTIONS) {
    const desc = describeCorrection('action_reversal', reversals.length);
    observations.push({
      observationId: `cor_${randomUUID()}`,
      workspaceId: input.workspaceId,
      correctedTarget: 'belief',
      originalOutput: desc.originalOutput,
      correctedOutput: desc.correctedOutput,
      correctionKind: 'action_reversal',
      observedAt: new Date(input.nowMs).toISOString(),
      evidenceEventIds: reversals.map((s) => s.eventId),
      confidence: computeConfidence(reversals.length),
    });
  }

  return observations;
}
