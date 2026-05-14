/**
 * UTP-TEAM-007 — Operator Feedback Loop
 *
 * Operator feedback flows back to valence aggregator via spine events.
 * Accepted suggestions emit positive valence signal. Dismissed
 * suggestions carry neutral valence (no penalty per TEAM-006 protocol).
 * Operator overrides are recorded as feedback for learning.
 */

import type { AbiValence } from '../abi/abi-schema';
import type { SpineEventRef } from '../mind/mind.types';
import type { FeedbackEntry, FeedbackInput } from './team.types';

const FEEDBACK_PROCESSOR = 'operator-feedback-loop';
const FEEDBACK_PROCESSOR_VERSION = '1.0.0';
const FEEDBACK_SCHEMA_VERSION = '1.0.0';

export interface FeedbackSpineInput {
  readonly eventName: string;
  readonly workspaceId: string;
  readonly truthMode: 'observed' | 'inferred' | 'projected';
  readonly provenance: {
    readonly source: 'synthetic' | 'production';
    readonly processor: string;
    readonly processorVersion: string;
    readonly schemaVersion: string;
  };
  readonly valence: AbiValence;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly entityRef?: { readonly entityType: string; readonly entityId: string };
  readonly correlationId?: string;
}

export function buildFeedbackEntry(input: FeedbackInput): FeedbackEntry {
  return {
    suggestionId: input.suggestionId,
    accepted: input.accepted,
    ...(input.operatorNote !== undefined
      ? { operatorNote: input.operatorNote }
      : {}),
    submittedAt: new Date().toISOString(),
    workspaceId: input.workspaceId,
    operatorId: input.operatorId,
  };
}

export function feedbackToValence(
  entry: FeedbackEntry,
): AbiValence {
  if (entry.accepted) return 'positive';
  return 'neutral';
}

export function feedbackToSpineInput(
  entry: FeedbackEntry,
): FeedbackSpineInput {
  return {
    eventName: 'cognition.valence_assigned',
    workspaceId: entry.workspaceId,
    truthMode: 'observed',
    provenance: {
      source: 'production',
      processor: FEEDBACK_PROCESSOR,
      processorVersion: FEEDBACK_PROCESSOR_VERSION,
      schemaVersion: FEEDBACK_SCHEMA_VERSION,
    },
    valence: feedbackToValence(entry),
    payload: {
      suggestionId: entry.suggestionId,
      accepted: entry.accepted,
      operatorId: entry.operatorId,
      ...(entry.operatorNote !== undefined
        ? { operatorNote: entry.operatorNote }
        : {}),
    },
    entityRef: {
      entityType: 'operator',
      entityId: entry.operatorId,
    },
    correlationId: `feedback_${entry.suggestionId}`,
  };
}

export function computeOperatorAccuracy(
  feedbacks: readonly FeedbackEntry[],
): number {
  if (feedbacks.length === 0) return 0;
  const accepted = feedbacks.filter((f) => f.accepted).length;
  return Math.round((accepted / feedbacks.length) * 100) / 100;
}

export function extractFeedbackFromEvents(
  events: readonly SpineEventRef[],
): readonly FeedbackEntry[] {
  return events
    .filter(
      (e) =>
        e.eventName === 'cognition.valence_assigned' &&
        e.payload !== undefined &&
        (e.payload as Record<string, unknown>)['suggestionId'] !== undefined &&
        e.entityRef?.entityType === 'operator',
    )
    .map(
      (e): FeedbackEntry => {
        const p = e.payload as Record<string, unknown>;
        return {
          suggestionId: p['suggestionId'] as string,
          accepted: p['accepted'] === true,
          submittedAt: e.occurredAt,
          workspaceId: e.workspaceId ?? '',
          operatorId: e.entityRef!.entityId,
          ...(typeof p['operatorNote'] === 'string'
            ? { operatorNote: p['operatorNote'] as string }
            : {}),
        };
      },
    );
}
