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
import {
  buildFeedbackEntry,
  feedbackToValence,
  computeOperatorAccuracy,
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

describe('PreCallContextBuilder (UTP-TEAM-001)', () => {
  it('builds context for a lead with history', () => {
    const events: SpineEventRef[] = [
      baseEvent({
        eventName: 'commerce.lead.created',
        entityRef: leadRef(leadA),
        valence: 'positive',
      }),
      baseEvent({
        eventName: 'commerce.lead.contacted',
        entityRef: leadRef(leadA),
        valence: 'neutral',
      }),
      baseEvent({
        eventName: 'commerce.lead.replied',
        entityRef: leadRef(leadA),
        valence: 'positive',
      }),
    ];

    const ctx = buildPreCallContext({
      leadId: leadA,
      conversationId: convId,
      workspaceId: wks,
      events,
    });

    expect(ctx.leadId).toBe(leadA);
    expect(ctx.conversationId).toBe(convId);
    expect(ctx.workspaceId).toBe(wks);
    expect(ctx.leadHistory.length).toBeGreaterThanOrEqual(3);
    expect(ctx.valenceTrace.length).toBeGreaterThanOrEqual(2);
    expect(ctx.assembledAt).toBeTruthy();
  });

  it('returns empty lists for a lead with no events', () => {
    const ctx = buildPreCallContext({
      leadId: leadB,
      conversationId: convId,
      workspaceId: wks,
      events: [],
    });

    expect(ctx.leadId).toBe(leadB);
    expect(ctx.leadHistory).toHaveLength(0);
    expect(ctx.valenceTrace).toHaveLength(0);
    expect(ctx.openQuestions).toHaveLength(0);
  });

  it('detects open questions from event patterns', () => {
    const events: SpineEventRef[] = [
      baseEvent({
        eventName: 'commerce.lead.went_silent',
        entityRef: leadRef(leadA),
      }),
      baseEvent({
        eventName: 'commerce.lead.objection_raised',
        entityRef: leadRef(leadA),
        valence: 'negative',
      }),
    ];

    const ctx = buildPreCallContext({
      leadId: leadA,
      conversationId: convId,
      workspaceId: wks,
      events,
    });

    expect(ctx.openQuestions.length).toBeGreaterThanOrEqual(2);
    expect(ctx.openQuestions.some((q) => q.includes('silent'))).toBe(true);
    expect(ctx.openQuestions.some((q) => q.includes('objection'))).toBe(true);
  });

  it('filters events by lead entityRef', () => {
    const events: SpineEventRef[] = [
      baseEvent({
        eventName: 'commerce.lead.created',
        entityRef: leadRef(leadA),
      }),
      baseEvent({
        eventName: 'commerce.lead.created',
        entityRef: leadRef(leadB),
      }),
    ];

    const ctxA = buildPreCallContext({
      leadId: leadA,
      conversationId: convId,
      workspaceId: wks,
      events,
    });

    expect(ctxA.leadHistory.length).toBe(1);
    expect(ctxA.leadId).toBe(leadA);
  });

  it('extracts current CRM stage from stage_changed events', () => {
    const events: SpineEventRef[] = [
      baseEvent({
        eventName: 'commerce.crm.stage_changed',
        entityRef: leadRef(leadA),
        payload: { toStage: 'negociacao' },
      }),
    ];

    const ctx = buildPreCallContext({
      leadId: leadA,
      conversationId: convId,
      workspaceId: wks,
      events,
    });

    expect(ctx.currentStage).toBe('negociacao');
  });
});

// ─── TEAM-002: Next-Best-Action Suggester ───────────────────────────

describe('NextBestActionSuggester (UTP-TEAM-002)', () => {
  const minimalCtx: PreCallContext = {
    leadId: leadA,
    conversationId: convId,
    workspaceId: wks,
    leadHistory: [],
    valenceTrace: [],
    openQuestions: [],
    assembledAt: new Date().toISOString(),
  };

  it('always returns at least one suggestion', () => {
    const suggestions = suggestNextBestActions({ context: minimalCtx });
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
  });

  it('returns at most 3 suggestions', () => {
    const suggestions = suggestNextBestActions({ context: minimalCtx });
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });

  it('suggestions are ranked by confidence descending', () => {
    const suggestions = suggestNextBestActions({ context: minimalCtx });
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1]!.confidence).toBeGreaterThanOrEqual(
        suggestions[i]!.confidence,
      );
    }
  });

  it('each suggestion has required fields', () => {
    const suggestions = suggestNextBestActions({ context: minimalCtx });
    for (const s of suggestions) {
      expect(s.rank).toBeGreaterThanOrEqual(1);
      expect(s.rank).toBeLessThanOrEqual(3);
      expect(s.action).toBeTruthy();
      expect(s.rationale).toBeTruthy();
      expect(s.confidence).toBeGreaterThan(0);
      expect(s.confidence).toBeLessThanOrEqual(1);
      expect(Array.isArray(s.guardrails)).toBe(true);
      expect(s.guardrails.length).toBeGreaterThan(0);
    }
  });

  it('degrades gracefully without maturity stage', () => {
    const suggestions = suggestNextBestActions({ context: minimalCtx });
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── TEAM-003: Forgotten-Followup Rescuer ───────────────────────────

describe('ForgottenFollowupRescuer (UTP-TEAM-003)', () => {
  it('returns empty when no leads are silent', () => {
    const events: SpineEventRef[] = [
      baseEvent({
        eventName: 'commerce.lead.created',
        entityRef: leadRef(leadA),
      }),
    ];

    const results = rescueForgottenFollowups({
      workspaceId: wks,
      events,
    });
    expect(results).toHaveLength(0);
  });

  it('detects leads silent past budget', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const events: SpineEventRef[] = [
      baseEvent({
        eventName: 'commerce.lead.went_silent',
        entityRef: leadRef(leadA),
        workspaceId: wks,
        occurredAt: twoDaysAgo,
      }),
    ];

    const results = rescueForgottenFollowups({
      workspaceId: wks,
      events,
      budgetHours: 24,
    });

    expect(results.length).toBeGreaterThanOrEqual(1);
    const r = results[0]!;
    expect(r.leadId).toBe(leadA);
    expect(r.urgency).toBeDefined();
  });

  it('skips leads with recent operator action', () => {
    const threeDaysAgo = new Date(
      Date.now() - 3 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const events: SpineEventRef[] = [
      baseEvent({
        eventName: 'commerce.lead.went_silent',
        entityRef: leadRef(leadA),
        workspaceId: wks,
        occurredAt: threeDaysAgo,
      }),
      baseEvent({
        eventName: 'commerce.whatsapp.message_replied',
        entityRef: leadRef(leadA),
        workspaceId: wks,
        occurredAt: oneHourAgo,
      }),
    ];

    const results = rescueForgottenFollowups({
      workspaceId: wks,
      events,
      budgetHours: 24,
    });

    expect(results).toHaveLength(0);
  });
});

// ─── TEAM-004: Blind-Spot Illuminator ───────────────────────────────

describe('BlindSpotIlluminator (UTP-TEAM-004)', () => {
  it('returns empty when no active leads detected', () => {
    const events: SpineEventRef[] = [
      baseEvent({
        eventName: 'commerce.lead.created',
        entityRef: leadRef(leadA),
        occurredAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];

    const spots = illuminateBlindSpots({
      workspaceId: wks,
      events,
      windowHours: 24,
    });

    expect(spots).toHaveLength(0);
  });

  it('identifies lead with recent activity but no operator action', () => {
    const recentReply = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const events: SpineEventRef[] = [
      baseEvent({
        eventName: 'commerce.lead.replied',
        entityRef: leadRef(leadA),
        workspaceId: wks,
        occurredAt: recentReply,
      }),
    ];

    const spots = illuminateBlindSpots({
      workspaceId: wks,
      events,
      windowHours: 24,
    });

    expect(spots.length).toBeGreaterThanOrEqual(1);
    const spot = spots[0]!;
    expect(spot.leadId).toBe(leadA);
    expect(spot.activityCount).toBeGreaterThanOrEqual(1);
  });

  it('excludes leads with recent operator action', () => {
    const recentReply = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const recentOpReply = new Date(
      Date.now() - 60 * 60 * 1000,
    ).toISOString();

    const events: SpineEventRef[] = [
      baseEvent({
        eventName: 'commerce.lead.replied',
        entityRef: leadRef(leadA),
        workspaceId: wks,
        occurredAt: recentReply,
      }),
      baseEvent({
        eventName: 'commerce.crm.next_step_defined',
        entityRef: leadRef(leadA),
        workspaceId: wks,
        occurredAt: recentOpReply,
      }),
    ];

    const spots = illuminateBlindSpots({
      workspaceId: wks,
      events,
      windowHours: 24,
    });

    expect(spots).toHaveLength(0);
  });
});

// ─── TEAM-005: Smart Handoff Service ────────────────────────────────

describe('SmartHandoffService (UTP-TEAM-005)', () => {
  it('packages context without maturity or trust state', () => {
    const service = new SmartHandoffService();

    const pkg = service.buildPackage({
      leadId: leadA,
      conversationId: convId,
      workspaceId: wks,
      events: [],
    });

    expect(pkg.leadId).toBe(leadA);
    expect(pkg.conversationId).toBe(convId);
    expect(pkg.preCallContext).toBeDefined();
    expect(pkg.suggestedActions.length).toBeGreaterThanOrEqual(1);
    expect(pkg.packagedAt).toBeTruthy();
  });

  it('includes maturity and trust state when provided', () => {
    const service = new SmartHandoffService();

    const pkg = service.buildPackage({
      leadId: leadA,
      conversationId: convId,
      workspaceId: wks,
      events: [],
      maturityStage: 'tracao',
      trustState: { score: 0.8 },
    });

    expect(pkg.maturityStage).toBe('tracao');
    expect(pkg.trustState).toEqual({ score: 0.8 });
  });

  it('produces distinct packages for different leads', () => {
    const service = new SmartHandoffService();

    const pkgA = service.buildPackage({
      leadId: leadA,
      conversationId: convId,
      workspaceId: wks,
      events: [],
    });

    const pkgB = service.buildPackage({
      leadId: leadB,
      conversationId: convId,
      workspaceId: wks,
      events: [],
    });

    expect(pkgA.leadId).not.toBe(pkgB.leadId);
  });
});

// ─── TEAM-006: Team Respect Protocol ────────────────────────────────

describe('TeamRespectProtocol (UTP-TEAM-006)', () => {
  const mockSuggestion: NextBestAction = {
    rank: 1,
    action: 'make_initial_contact',
    rationale: 'lead not yet contacted',
    confidence: 0.82,
    evidenceRefs: [],
    guardrails: ['verify lead uniqueness'],
  };

  it('formats suggestion for display', () => {
    const display = formatSuggestionForDisplay(mockSuggestion);
    expect(display).toContain('#1');
    expect(display).toContain('make_initial_contact');
  });

  it('builds suggestion message with dismissible flag', () => {
    const msg = buildSuggestionMessage(mockSuggestion);
    expect(msg.dismissible).toBe(true);
    expect(msg.action).toBe('make_initial_contact');
    expect(msg.guardrails.length).toBeGreaterThan(0);
  });

  it('validates operator dismissal', () => {
    const result = validateSuggestionDismissal(mockSuggestion, {
      suggestionId: 'sugg_001',
      operatorId: 'op_test',
      action: 'dismiss',
      dismissedAt: new Date().toISOString(),
    });
    expect(result.valid).toBe(true);
  });

  it('rejects dismissal without operatorId', () => {
    const result = validateSuggestionDismissal(mockSuggestion, {
      suggestionId: 'sugg_001',
      operatorId: '',
      action: 'dismiss',
      dismissedAt: new Date().toISOString(),
    });
    expect(result.valid).toBe(false);
  });

  it('always allows operator override', () => {
    expect(isOperatorOverrideAllowed()).toBe(true);
  });

  it('builds unique suggestion IDs', () => {
    const id1 = buildSuggestionId('op1', 1, new Date().toISOString());
    const id2 = buildSuggestionId('op1', 2, new Date().toISOString());
    expect(id1).not.toBe(id2);
  });

  it('has respect rules defined', () => {
    expect(TEAM_RESPECT_RULES.size).toBeGreaterThanOrEqual(4);
  });
});

// ─── TEAM-007: Operator Feedback Loop ───────────────────────────────

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
