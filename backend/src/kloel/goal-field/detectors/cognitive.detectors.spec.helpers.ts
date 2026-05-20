import type { SpineEventRef } from '../../mind/mind.types';
import { COGNITIVE_DETECTORS } from './cognitive.detectors';

/**
 * Shared helpers for cognitive detector specs — extracted so each spec file
 * stays below the architecture-guard line budget.
 */

export const NOW = Date.parse('2026-05-13T22:00:00.000Z');

export function ev(over: Partial<SpineEventRef>): SpineEventRef {
  const e: Record<string, unknown> = {
    eventId: over.eventId ?? `e_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over.eventName ?? 'commerce.lead.replied',
    workspaceId: over.workspaceId ?? 'wks_demo',
    occurredAt: over.occurredAt ?? '2026-05-13T20:00:00.000Z',
    truthMode: over.truthMode ?? 'observed',
  };
  if ('entityRef' in over) {
    if (over.entityRef !== undefined) {
      e['entityRef'] = over.entityRef;
    }
  } else {
    e['entityRef'] = { entityType: 'lead', entityId: 'lead_1' };
  }
  if (over.valence !== undefined) {
    e['valence'] = over.valence;
  }
  if (over.payload !== undefined) {
    e['payload'] = over.payload;
  }
  if (over.correlationId !== undefined) {
    e['correlationId'] = over.correlationId;
  }
  return e as unknown as SpineEventRef;
}

// Access all detectors via the array
export const [
  decisionWithoutPersistenceDetector,
  conversationWithoutValenceDetector,
  repeatedAgentFailureDetector,
  capabilityWithoutRuntimeEvidenceDetector,
] = COGNITIVE_DETECTORS;
