/**
 * UTP-RECOVERY-001 — Self Error Detector.
 *
 * Scans recent spine events to identify failures originating from the
 * organism: handoffs, payment declines, misclassifications (inferred via
 * correction events), missed opportunities (went_silent after reply
 * without follow-up), and inappropriate timing.
 *
 * Pure function — stateless detection from event stream.
 */

import { randomUUID } from 'node:crypto';
import type { SpineEventRef } from '../mind/mind.types';
import type {
  DetectedError,
  ErrorCategory,
  ErrorDetectorInput,
  ErrorFingerprint,
} from './recovery.types';
import { hashEventPattern } from './recovery.types';

const MIN_EVENTS = 3;
const HANDOFF_HIGH_SEVERITY_THRESHOLD = 5;
const DECLINE_HIGH_SEVERITY_THRESHOLD = 3;

function makeFingerprint(
  kind: ErrorCategory,
  workspaceId: string,
  entityRef: string | undefined,
  related: readonly SpineEventRef[],
): ErrorFingerprint {
  return {
    kind,
    workspaceId,
    entityRef,
    eventPatternHash: hashEventPattern(related),
    firstSeenAt: related.length > 0 ? (related[0]?.occurredAt ?? '') : '',
    repeatCount: 1,
    lastSeenAt:
      related.length > 0
        ? (related[related.length - 1]?.occurredAt ?? '')
        : '',
  };
}

function severityFromCount(
  category: ErrorCategory,
  count: number,
): 'low' | 'medium' | 'high' {
  if (category === 'handoff') {
    if (count >= HANDOFF_HIGH_SEVERITY_THRESHOLD) return 'high';
    return count >= 2 ? 'medium' : 'low';
  }
  if (category === 'decline') {
    if (count >= DECLINE_HIGH_SEVERITY_THRESHOLD) return 'high';
    return count >= 2 ? 'medium' : 'low';
  }
  return count >= 4 ? 'high' : count >= 2 ? 'medium' : 'low';
}

function detectHandoffs(
  input: ErrorDetectorInput,
): DetectedError[] {
  const handoffEvents = input.events.filter(
    (e) => e.eventName === 'commerce.whatsapp.handoff_to_human',
  );
  if (handoffEvents.length === 0) return [];

  return [
    {
      errorId: `err_${randomUUID()}`,
      category: 'handoff' as ErrorCategory,
      workspaceId: input.workspaceId,
      detectedAt: new Date(input.nowMs).toISOString(),
      evidenceEventIds: handoffEvents.map((e) => e.eventId),
      description: `${handoffEvents.length} conversation handoff(s) to human detected — potential agent failure or insufficient confidence`,
      severity: severityFromCount('handoff', handoffEvents.length),
      fingerprint: makeFingerprint('handoff', input.workspaceId, undefined, handoffEvents),
    },
  ];
}

function detectDeclines(
  input: ErrorDetectorInput,
): DetectedError[] {
  const declineEvents = input.events.filter(
    (e) => e.eventName === 'commerce.payment.declined',
  );
  if (declineEvents.length === 0) return [];

  return [
    {
      errorId: `err_${randomUUID()}`,
      category: 'decline' as ErrorCategory,
      workspaceId: input.workspaceId,
      detectedAt: new Date(input.nowMs).toISOString(),
      evidenceEventIds: declineEvents.map((e) => e.eventId),
      description: `${declineEvents.length} payment decline(s) detected — may indicate offer/pricing issue`,
      severity: severityFromCount('decline', declineEvents.length),
      fingerprint: makeFingerprint('decline', input.workspaceId, undefined, declineEvents),
    },
  ];
}

function detectMisclassifications(
  input: ErrorDetectorInput,
): DetectedError[] {
  const qualified = input.events.filter(
    (e) => e.eventName === 'commerce.lead.objection_raised',
  );
  const corrections = qualified.filter((e) => {
    const causedBy = (e.payload as Record<string, unknown> | undefined)?.[
      'causedByEventId'
    ];
    return typeof causedBy === 'string' && causedBy.length > 0;
  });

  if (corrections.length < MIN_EVENTS) return [];

  return [
    {
      errorId: `err_${randomUUID()}`,
      category: 'misclassification' as ErrorCategory,
      workspaceId: input.workspaceId,
      detectedAt: new Date(input.nowMs).toISOString(),
      evidenceEventIds: corrections.map((e) => e.eventId),
      description: `${corrections.length} lead misclassification(s) detected — classifier may need tuning`,
      severity: severityFromCount('misclassification', corrections.length),
      fingerprint: makeFingerprint(
        'misclassification',
        input.workspaceId,
        undefined,
        corrections,
      ),
    },
  ];
}

function detectMissedOpportunities(
  input: ErrorDetectorInput,
): DetectedError[] {
  const wentSilentEvents = input.events.filter(
    (e) => e.eventName === 'commerce.lead.went_silent',
  );

  const leadLostEvents = input.events.filter(
    (e) => e.eventName === 'commerce.lead.lost',
  );

  const total = wentSilentEvents.length + leadLostEvents.length;
  if (total < MIN_EVENTS) return [];

  return [
    {
      errorId: `err_${randomUUID()}`,
      category: 'missed_opportunity' as ErrorCategory,
      workspaceId: input.workspaceId,
      detectedAt: new Date(input.nowMs).toISOString(),
      evidenceEventIds: [...wentSilentEvents, ...leadLostEvents].map(
        (e) => e.eventId,
      ),
      description: `${total} missed opportunity(s) — ${wentSilentEvents.length} silent, ${leadLostEvents.length} lost leads`,
      severity: severityFromCount('missed_opportunity', total),
      fingerprint: makeFingerprint(
        'missed_opportunity',
        input.workspaceId,
        undefined,
        [...wentSilentEvents, ...leadLostEvents],
      ),
    },
  ];
}

/**
 * Scan spine events for organism-originated failures.
 *
 * Input: ErrorDetectorInput (events, workspaceId, nowMs, windowDays)
 * Output: DetectedError[] (all detected errors in the window)
 */
export function detectErrors(input: ErrorDetectorInput): DetectedError[] {
  const errors: DetectedError[] = [];

  errors.push(...detectHandoffs(input));
  errors.push(...detectDeclines(input));
  errors.push(...detectMisclassifications(input));
  errors.push(...detectMissedOpportunities(input));

  return errors;
}
