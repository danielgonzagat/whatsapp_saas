/**
 * UTP-OWNER-CRIT-002 — Correction Observer.
 *
 * Observes owner corrections to system outputs: message rewrites,
 * classification fixes, action reversals, and policy adjustments.
 *
 * Each observation carries future behavior evidence:
 * - original and corrected output (memory text)
 * - learnedCriterion (why the correction was needed)
 * - futureBehaviorChange (what should change going forward)
 * - acceptedWithoutDefense (no-defensive acceptance signal)
 *
 * Pure function — takes SpineEventRef[] and returns CorrectionObservation[].
 */

import { randomUUID } from 'node:crypto';
import type { SpineEventRef } from '../../mind/mind.types';
import type {
  CorrectionKind,
  CorrectionObservation,
  FutureBehaviorChange,
  ObserverInput,
} from '../owner-criterion.types';

const MIN_CORRECTIONS = 2;

interface CorrectionSignal {
  readonly correctionKind: CorrectionKind;
  readonly correctedTarget: string;
  readonly eventId: string;
  readonly occurredAt: string;
  readonly payload: Readonly<Record<string, unknown>> | undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function hasExplicitMessageRewriteEvidence(payload: unknown): payload is Readonly<Record<string, unknown>> {
  if (!isRecord(payload)) {
    return false;
  }
  const correctionKind = readString(payload['correctionKind']);
  const correctedTarget = readString(payload['correctedTarget']);
  const originalOutput = readString(payload['originalOutput']);
  const correctedOutput = readString(payload['correctedOutput']);
  const explicitCorrection =
    payload['ownerCorrected'] === true ||
    correctionKind === 'message_rewrite' ||
    correctedTarget === 'auto_reply';

  return explicitCorrection && originalOutput.length > 0 && correctedOutput.length > 0;
}

function extractMessageRewrites(events: readonly SpineEventRef[]): CorrectionSignal[] {
  return events
    .filter((e) => e.eventName === 'commerce.whatsapp.message_replied')
    .filter((e) => hasExplicitMessageRewriteEvidence(e.payload))
    .map((e) => ({
      correctionKind: 'message_rewrite' as CorrectionKind,
      correctedTarget: readString(e.payload?.['correctedTarget']) || 'auto_reply',
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

function hasOperatorLearningFeedback(payload: unknown): payload is Readonly<Record<string, unknown>> {
  if (!isRecord(payload)) {
    return false;
  }

  return (
    payload['accepted'] === false &&
    readString(payload['operatorNote']).length > 0 &&
    readString(payload['learningFraming']).includes('not human performance scoring')
  );
}

function extractOperatorFeedbackCorrections(events: readonly SpineEventRef[]): CorrectionSignal[] {
  return events
    .filter((e) => e.eventName === 'cognition.valence_assigned')
    .filter((e) => e.entityRef?.entityType === 'operator')
    .filter((e) => hasOperatorLearningFeedback(e.payload))
    .map((e) => ({
      correctionKind: 'policy_adjustment' as CorrectionKind,
      correctedTarget: 'operator_feedback',
      eventId: e.eventId,
      occurredAt: e.occurredAt,
      payload: e.payload,
    }));
}

function describeCorrection(
  kind: CorrectionKind,
  signals: readonly CorrectionSignal[],
): { readonly originalOutput: string; readonly correctedOutput: string } {
  const signalCount = signals.length;
  const firstPayload = signals.find((signal) => signal.payload)?.payload;
  const originalOutput = readString(firstPayload?.['originalOutput']);
  const correctedOutput = readString(firstPayload?.['correctedOutput']);

  if (kind === 'policy_adjustment' && signals[0]?.correctedTarget === 'operator_feedback') {
    const suggestionId = readString(firstPayload?.['suggestionId']);
    const operatorNote = readString(firstPayload?.['operatorNote']);
    return {
      originalOutput: suggestionId
        ? `suggestion ${suggestionId}`
        : `team-facing suggestion (${signalCount} instances detected)`,
      correctedOutput: operatorNote || `operator correction (${signalCount} instances applied)`,
    };
  }

  return {
    originalOutput: originalOutput || `system output (${signalCount} instances detected)`,
    correctedOutput: correctedOutput || `owner-corrected output (${signalCount} instances applied)`,
  };
}

function computeConfidence(signalCount: number): number {
  if (signalCount >= 10) return 0.9;
  if (signalCount >= 5) return 0.75;
  if (signalCount >= 3) return 0.6;
  return 0.4;
}

function inferLearnedCriterion(
  kind: CorrectionKind,
  originalOutput: string,
  correctedOutput: string,
  signalCount: number,
): string {
  switch (kind) {
    case 'message_rewrite':
      return `Owner rewrites auto-reply messages (${signalCount} instances). System output was ${describeTrim(
        originalOutput,
      )}; owner corrected to ${describeTrim(correctedOutput)}. Criterion: system must not finalize auto-replies that deviate from owner-observed tone and intent.`;
    case 'classification_fix':
      return `Owner corrects lead classifications (${signalCount} instances). System classified leads without full context; owner reclassified. Criterion: lead classification must defer to owner judgment when evidence is incomplete.`;
    case 'action_reversal':
      return `Owner reverses system actions (${signalCount} instances). System committed a belief update that owner reversed. Criterion: irreversible actions require owner confirmation before execution.`;
    case 'policy_adjustment':
      return `Operator/team feedback corrected Kloel criteria (${signalCount} instances). System suggestion was ${describeTrim(
        originalOutput,
      )}; operator corrected to ${describeTrim(correctedOutput)}. Criterion: team feedback must update future suggestions without becoming human performance scoring.`;
    default:
      return `Owner applied ${kind} correction across ${signalCount} instances. Criterion: system must learn from owner corrections to avoid repeating the same deviation.`;
  }
}

function buildFutureBehaviorChange(
  kind: CorrectionKind,
  target: string,
  signalCount: number,
  confidence: number,
): FutureBehaviorChange {
  const behaviorConfidence = Math.min(confidence, computeConfidence(signalCount) + 0.05);

  switch (kind) {
    case 'message_rewrite':
      return {
        declarativeRule:
          'When generating auto-reply messages, system must consult the owner tone profile and correction history before finalizing output.',
        targetDomain: target,
        behaviorConstraint:
          'Do not send auto-replies without verifying against the most recent owner correction pattern for this target.',
        confidence: Math.round(behaviorConfidence * 100) / 100,
      };
    case 'classification_fix':
      return {
        declarativeRule:
          'When classifying leads, system must flag low-confidence classifications for owner review instead of auto-committing.',
        targetDomain: target,
        behaviorConstraint:
          'Any lead classification with confidence below 0.7 must be escalated to owner before becoming actionable.',
        confidence: Math.round(behaviorConfidence * 100) / 100,
      };
    case 'action_reversal':
      return {
        declarativeRule:
          'System must not execute irreversible belief updates without owner confirmation when correction history shows reversal pattern.',
        targetDomain: target,
        behaviorConstraint:
          'Belief updates categorized as irreversible must require explicit owner approval before they propagate to downstream decisions.',
        confidence: Math.round(behaviorConfidence * 100) / 100,
      };
    case 'policy_adjustment':
      return {
        declarativeRule:
          'When team feedback corrects a suggestion, system must treat the note as Kloel learning rather than human performance scoring.',
        targetDomain: target,
        behaviorConstraint:
          'Future suggestions in this domain must incorporate repeated operator correction notes before recommending action.',
        confidence: Math.round(behaviorConfidence * 100) / 100,
      };
    default:
      return {
        declarativeRule: `System must adapt future behavior based on owner ${kind} corrections.`,
        targetDomain: target,
        behaviorConstraint:
          'Future outputs in this domain must be validated against owner correction evidence before execution.',
        confidence: Math.round(behaviorConfidence * 100) / 100,
      };
  }
}

function detectNonDefensiveAcceptance(signals: readonly CorrectionSignal[]): boolean {
  if (signals.length === 0) return false;

  const defensiveMarkers = [
    'rejectionReason',
    'defenseReason',
    'ownerDisagreed',
    'conditionalAcceptance',
    'partialOverride',
  ];

  for (const signal of signals) {
    const payload = signal.payload;
    if (!payload) continue;
    for (const marker of defensiveMarkers) {
      if (payload[marker] !== undefined && payload[marker] !== null && payload[marker] !== false) {
        return false;
      }
    }
  }

  return true;
}

function describeTrim(s: string): string {
  return s.length > 120 ? s.slice(0, 117) + '...' : s;
}

function buildObservation(
  kind: CorrectionKind,
  target: string,
  originalOutput: string,
  correctedOutput: string,
  signals: readonly CorrectionSignal[],
  input: ObserverInput,
): CorrectionObservation {
  const signalCount = signals.length;
  const confidence = computeConfidence(signalCount);

  return {
    observationId: `cor_${randomUUID()}`,
    workspaceId: input.workspaceId,
    correctedTarget: target,
    originalOutput,
    correctedOutput,
    correctionKind: kind,
    observedAt: new Date(input.nowMs).toISOString(),
    evidenceEventIds: signals.map((s) => s.eventId),
    confidence,
    learnedCriterion: inferLearnedCriterion(kind, originalOutput, correctedOutput, signalCount),
    futureBehaviorChange: buildFutureBehaviorChange(kind, target, signalCount, confidence),
    acceptedWithoutDefense: detectNonDefensiveAcceptance(signals),
  };
}

/**
 * Observe owner corrections from spine events.
 *
 * Input: ObserverInput
 * Output: CorrectionObservation[] — one per detected correction kind,
 *         each carrying future behavior evidence.
 */
export function observeCorrections(input: ObserverInput): CorrectionObservation[] {
  const observations: CorrectionObservation[] = [];

  const rewrites = extractMessageRewrites(input.events);
  const classificationFixes = extractClassificationFixes(input.events);
  const reversals = extractActionReversals(input.events);
  const operatorFeedback = extractOperatorFeedbackCorrections(input.events);

  if (rewrites.length >= MIN_CORRECTIONS) {
    const desc = describeCorrection('message_rewrite', rewrites);
    observations.push(
      buildObservation(
        'message_rewrite',
        rewrites[0]?.correctedTarget ?? 'auto_reply',
        desc.originalOutput,
        desc.correctedOutput,
        rewrites,
        input,
      ),
    );
  }

  if (classificationFixes.length >= MIN_CORRECTIONS) {
    const desc = describeCorrection('classification_fix', classificationFixes);
    observations.push(
      buildObservation(
        'classification_fix',
        'lead_classification',
        desc.originalOutput,
        desc.correctedOutput,
        classificationFixes,
        input,
      ),
    );
  }

  if (reversals.length >= MIN_CORRECTIONS) {
    const desc = describeCorrection('action_reversal', reversals);
    observations.push(
      buildObservation(
        'action_reversal',
        'belief',
        desc.originalOutput,
        desc.correctedOutput,
        reversals,
        input,
      ),
    );
  }

  if (operatorFeedback.length >= MIN_CORRECTIONS) {
    const desc = describeCorrection('policy_adjustment', operatorFeedback);
    observations.push(
      buildObservation(
        'policy_adjustment',
        'operator_feedback',
        desc.originalOutput,
        desc.correctedOutput,
        operatorFeedback,
        input,
      ),
    );
  }

  return observations;
}
