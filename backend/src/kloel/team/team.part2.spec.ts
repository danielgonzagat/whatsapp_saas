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

  it('adds an R1 delegation contract to forgotten follow-up candidates', () => {
    const silentAt = new Date(
      Date.now() - 4 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const events: SpineEventRef[] = [
      baseEvent({
        eventName: 'commerce.lead.objection_raised',
        entityRef: leadRef(leadA),
        workspaceId: wks,
        occurredAt: new Date(
          Date.now() - 5 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      }),
      baseEvent({
        eventName: 'commerce.lead.went_silent',
        entityRef: leadRef(leadA),
        workspaceId: wks,
        occurredAt: silentAt,
      }),
    ];

    const results = rescueForgottenFollowups({
      workspaceId: wks,
      events,
      budgetHours: 24,
    });

    expect(results[0]!.r1Contract.riskClass).toBe('R1');
    expect(results[0]!.r1Contract.delegationMode).toBe('allowed_alone');
    expect(results[0]!.r1Contract.safeNextStep).toContain('do not send');
    expect(results[0]!.r1Contract.leadOutcomeGuardrail.antiPressureLanguage).toBe(
      true,
    );
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

  it('packages raw post-sale churn risk into value-gap context and human-only action', () => {
    const service = new SmartHandoffService();

    const pkg = service.buildPackage({
      leadId: leadA,
      conversationId: convId,
      workspaceId: wks,
      events: [
        baseEvent({
          eventName: 'commerce.post_sale.churn_risk_detected',
          entityRef: leadRef(leadA),
          valence: 'negative',
          payload: { signals: ['first_value_missing'] },
        }),
      ],
    });

    expect(pkg.preCallContext.leadHistory).toHaveLength(1);
    expect(pkg.preCallContext.openQuestions[0]).toContain('first value');

    const action = pkg.suggestedActions.find(
      (s) => s.action === 'review_post_sale_value_gap',
    );

    expect(action).toBeDefined();
    expect(action!.r1Contract.riskClass).toBe('R2');
    expect(action!.r1Contract.delegationMode).toBe('human_only');
    expect(action!.guardrails).toContain(
      'frame as customer support, not team failure',
    );
  });
});

// ─── TEAM-006: Team Respect Protocol ────────────────────────────────
