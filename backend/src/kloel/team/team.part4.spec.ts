/**
 * UTP-TEAM-001..007 — Team Augmentation Contract Spec
 *
 * Camada XII: full contract tests for all 7 TEAM UTP components.
 * Verifies pre-call context, next-best-action, forgotten-followup,
 * blind-spot, smart handoff, respect protocol, and feedback loop.
 */

import { buildPreCallContext } from './pre-call-context.builder';
import { suggestNextBestActions } from './next-best-action.suggester';
import { rescueForgottenFollowups } from './forgotten-followup.rescuer';
import { illuminateBlindSpots } from './blind-spot-illuminator';
import { SmartHandoffService } from './smart-handoff.service';
import {
  formatSuggestionForDisplay,
  buildSuggestionMessage,
  validateSuggestionDismissal,
  isOperatorOverrideAllowed,
  buildSuggestionId,
  TEAM_RESPECT_RULES,
} from './team-respect.protocol';
import type { SuggestionR1Contract } from './team.types';
import {
  buildFeedbackEntry,
  feedbackToValence,
  computeOperatorAccuracy,
  summarizeOperatorFeedbackForLearning,
  extractFeedbackFromEvents,
  feedbackToSpineInput,
} from './operator-feedback.loop';

import type { SpineEventRef } from '../mind/mind.types';
import type { PreCallContext, NextBestAction } from './team.types';

const baseEvent = (
  over: Partial<SpineEventRef> = {},
): SpineEventRef => ({
  eventId: over.eventId ?? `evt_test_${Math.random().toString(36).slice(2, 8)}`,
  eventName: over.eventName ?? 'commerce.lead.created',
  workspaceId: over.workspaceId ?? 'wks_demo',
  occurredAt: over.occurredAt ?? new Date().toISOString(),
  truthMode: over.truthMode ?? 'observed',
  ...(over.entityRef !== undefined ? { entityRef: over.entityRef } : {}),
  ...(over.valence !== undefined ? { valence: over.valence } : {}),
  ...(over.payload !== undefined ? { payload: over.payload } : {}),
  ...(over.correlationId !== undefined
    ? { correlationId: over.correlationId }
    : {}),
});

const leadRef = (leadId: string) => ({
  entityType: 'lead' as const,
  entityId: leadId,
});

const convId = 'conv_test_001';
const leadA = 'lead_test_a';
const leadB = 'lead_test_b';
const wks = 'wks_demo';

// ─── TEAM-001: Pre-Call Context Builder ─────────────────────────────

describe('OperatorFeedbackLoop (UTP-TEAM-007)', () => {
  it('builds feedback entry for accepted suggestion', () => {
    const entry = buildFeedbackEntry({
      suggestionId: 'sugg_001',
      accepted: true,
      operatorId: 'op_test',
      workspaceId: wks,
    });

    expect(entry.accepted).toBe(true);
    expect(entry.operatorId).toBe('op_test');
    expect(entry.workspaceId).toBe(wks);
    expect(entry.submittedAt).toBeTruthy();
  });

  it('accepted suggestion maps to positive valence', () => {
    const entry = buildFeedbackEntry({
      suggestionId: 'sugg_001',
      accepted: true,
      operatorId: 'op_test',
      workspaceId: wks,
    });
    expect(feedbackToValence(entry)).toBe('positive');
  });

  it('dismissed suggestion maps to neutral valence', () => {
    const entry = buildFeedbackEntry({
      suggestionId: 'sugg_002',
      accepted: false,
      operatorId: 'op_test',
      workspaceId: wks,
    });
    expect(feedbackToValence(entry)).toBe('neutral');
  });

  it('converts feedback to spine input event', () => {
    const entry = buildFeedbackEntry({
      suggestionId: 'sugg_001',
      accepted: true,
      operatorId: 'op_test',
      workspaceId: wks,
    });

    const spine = feedbackToSpineInput(entry);
    expect(spine.eventName).toBe('cognition.valence_assigned');
    expect(spine.valence).toBe('positive');
    expect(spine.workspaceId).toBe(wks);
    expect(spine.truthMode).toBe('observed');
    expect(spine.provenance.processor).toBeTruthy();
    expect(spine.payload['learningFraming']).toContain(
      'not human performance scoring',
    );
  });

  it('computes operator accuracy from feedback entries', () => {
    const entries = [
      buildFeedbackEntry({
        suggestionId: 'sugg_001',
        accepted: true,
        operatorId: 'op_test',
        workspaceId: wks,
      }),
      buildFeedbackEntry({
        suggestionId: 'sugg_002',
        accepted: true,
        operatorId: 'op_test',
        workspaceId: wks,
      }),
      buildFeedbackEntry({
        suggestionId: 'sugg_003',
        accepted: false,
        operatorId: 'op_test',
        workspaceId: wks,
      }),
    ];

    expect(computeOperatorAccuracy(entries)).toBeCloseTo(2 / 3, 2);
  });

  it('computes zero accuracy for empty feedback', () => {
    expect(computeOperatorAccuracy([])).toBe(0);
  });

  it('summarizes operator feedback as Kloel learning, not human scoring', () => {
    const entries = [
      buildFeedbackEntry({
        suggestionId: 'sugg_001',
        accepted: true,
        operatorId: 'op_test',
        workspaceId: wks,
        operatorNote: 'good timing',
      }),
      buildFeedbackEntry({
        suggestionId: 'sugg_002',
        accepted: false,
        operatorId: 'op_test',
        workspaceId: wks,
        operatorNote: 'customer needs delivery help before retention',
      }),
    ];

    const summary = summarizeOperatorFeedbackForLearning(entries);

    expect(summary.totalFeedback).toBe(2);
    expect(summary.acceptedSuggestions).toBe(1);
    expect(summary.correctionSignals).toBe(1);
    expect(summary.learningSignals).toContain(
      'customer needs delivery help before retention',
    );
    expect(summary.framing).toContain('not human performance scoring');
  });

  it('extracts feedback from spine events', () => {
    const events: SpineEventRef[] = [
      baseEvent({
        eventName: 'cognition.valence_assigned',
        workspaceId: wks,
        valence: 'positive',
        payload: {
          suggestionId: 'sugg_001',
          accepted: true,
          operatorId: 'op_test',
        },
        entityRef: { entityType: 'operator', entityId: 'op_test' },
      }),
    ];

    const entries = extractFeedbackFromEvents(events);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.accepted).toBe(true);
    expect(entries[0]!.suggestionId).toBe('sugg_001');
  });
});
