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

  it('detects post-sale churn risk as human-only value-gap open question', () => {
    const events: SpineEventRef[] = [
      baseEvent({
        eventName: 'commerce.post_sale.churn_risk_detected',
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

    expect(ctx.leadHistory.length).toBe(1);
    expect(ctx.leadHistory[0]!.eventName).toBe(
      'commerce.post_sale.churn_risk_detected',
    );
    expect(ctx.openQuestions.length).toBe(1);
    expect(ctx.openQuestions[0]).toContain('first value');
    expect(ctx.openQuestions[0]).toContain('human review only');
    expect(ctx.openQuestions[0]).not.toContain('failure');
    expect(ctx.openQuestions[0]).not.toContain('blame');
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

  it('treats qualified silence as R1 suggestion without sending', () => {
    const context: PreCallContext = {
      ...minimalCtx,
      leadHistory: [
        {
          eventId: 'evt_silent',
          eventName: 'commerce.lead.went_silent',
          occurredAt: new Date().toISOString(),
          summary: 'silent',
        },
        {
          eventId: 'evt_objection',
          eventName: 'commerce.lead.objection_raised',
          occurredAt: new Date().toISOString(),
          summary: 'objection',
        },
      ],
      openQuestions: [
        'lead went silent after raising objection - re-engagement requires understanding of unresolved concern',
      ],
    };

    const suggestions = suggestNextBestActions({ context });
    const action = suggestions.find(
      (s) => s.action === 'reengage_silent_lead',
    );

    expect(action).toBeDefined();
    expect(action!.r1Contract.riskClass).toBe('R1');
    expect(action!.r1Contract.delegationMode).toBe('allowed_alone');
    expect(action!.r1Contract.safeNextStep).toContain('do not send');
    expect(action!.r1Contract.leadOutcomeGuardrail.antiPressureLanguage).toBe(
      true,
    );
    expect(action!.r1Contract.rollback).toContain('dismiss_suggestion');
  });

  it('does not re-engage unqualified silence as if it were a hot lead', () => {
    const context: PreCallContext = {
      ...minimalCtx,
      leadHistory: [
        {
          eventId: 'evt_silent',
          eventName: 'commerce.lead.went_silent',
          occurredAt: new Date().toISOString(),
          summary: 'silent',
        },
      ],
      openQuestions: [
        'lead entered silent state without clear context - review timeline before assuming disinterest',
      ],
    };

    const suggestions = suggestNextBestActions({ context });

    expect(
      suggestions.some((s) => s.action === 'reengage_silent_lead'),
    ).toBe(false);
    expect(suggestions[0]!.action).toBe('review_silent_lead');
    expect(suggestions[0]!.r1Contract.riskClass).toBe('R1');
    expect(suggestions[0]!.r1Contract.safeNextStep).toContain(
      'review timeline',
    );
  });

  it('routes post-sale churn risk to human-only value-gap review without blaming the team', () => {
    const context: PreCallContext = {
      ...minimalCtx,
      leadHistory: [
        {
          eventId: 'evt_post_sale_risk',
          eventName: 'commerce.post_sale.churn_risk_detected',
          occurredAt: new Date().toISOString(),
          summary: 'post-sale churn risk from first_value_missing',
          valence: 'negative',
        },
      ],
      openQuestions: ['customer has not reached first value yet'],
    };

    const suggestions = suggestNextBestActions({ context });
    const action = suggestions.find(
      (s) => s.action === 'review_post_sale_value_gap',
    );

    expect(action).toBeDefined();
    expect(action!.rationale).toContain('first value');
    expect(action!.guardrails).toContain(
      'frame as customer support, not team failure',
    );
    expect(action!.r1Contract.riskClass).toBe('R2');
    expect(action!.r1Contract.delegationMode).toBe('human_only');
    expect(action!.r1Contract.safeNextStep).toContain('verify delivery');
  });
});

// ─── TEAM-003: Forgotten-Followup Rescuer ───────────────────────────
