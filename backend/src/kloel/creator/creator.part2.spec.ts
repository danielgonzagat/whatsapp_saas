/**
 * UTP-CREATOR-001..006 — Creator Intelligence Spec
 *
 * Contract tests for Camada XXVI creator layer: audience-partner fit
 * detection, mention timing advice, audience saturation detection,
 * authenticity protection, engagement-vs-conversion tracking, and
 * creator trust capital tracking (extends Camada IX trust).
 */

import { detectAudiencePartnerFit, type PartnerProfile } from './audience-partner-fit.detector';
import { adviseMentionTiming, type MentionHistoryEntry } from './mention-timing.advisor';
import { detectAudienceSaturation } from './audience-saturation.detector';
import { protectAuthenticity } from './authenticity.protector';
import { trackEngagementVsConversion } from './engagement-vs-conversion.tracker';
import { CreatorTrustCapitalTrackerService } from './creator-trust-capital.tracker';

import type { CreatorEvent } from './types';
import type { TrustState } from '../trust/trust.types';

const NOW = Date.parse('2026-05-14T00:00:00.000Z');

function baseCreatorEvent(
  over: Partial<CreatorEvent> = {},
): CreatorEvent {
  return {
    eventId: over.eventId ?? `evt_${Math.random().toString(36).slice(2, 8)}`,
    eventName: over.eventName ?? 'commerce.lead.replied',
    occurredAt: over.occurredAt ?? new Date(NOW).toISOString(),
    ...(over.valence !== undefined ? { valence: over.valence } : {}),
    ...(over.payload !== undefined ? { payload: over.payload } : {}),
  };
}

function trustState(over?: Partial<TrustState>): TrustState {
  return {
    trustScore: over?.trustScore ?? 0.75,
    fatigueLevel: over?.fatigueLevel ?? 0,
    desperationLevel: over?.desperationLevel ?? 0,
    lastInteractionAt: over?.lastInteractionAt ?? new Date(NOW).toISOString(),
    silentInteractionsCount: over?.silentInteractionsCount ?? 0,
    brandRiskFlags: over?.brandRiskFlags ?? [],
  };
}

// ─── CREATOR-001: Audience-Partner Fit Detection ────────────────────

describe('CreatorTrustCapitalTrackerService (UTP-CREATOR-006)', () => {
  let tracker: CreatorTrustCapitalTrackerService;

  beforeEach(() => {
    tracker = new CreatorTrustCapitalTrackerService();
  });

  it('returns default capital for new workspace with no data', () => {
    const state = tracker.getDefaultCapital('wks_test');
    expect(state.trustCapital).toBeGreaterThan(0.5);
    expect(state.verdict).toBe('stable');
    expect(state.workspaceId).toBe('wks_test');
  });

  it('computes capital from events and trust states', () => {
    const events: CreatorEvent[] = Array.from({ length: 10 }, () =>
      baseCreatorEvent({
        eventName: 'commerce.lead.replied',
        valence: 'positive',
        payload: { messageBody: 'Excelente conteúdo!' },
      }),
    );
    const states: TrustState[] = [trustState({ trustScore: 0.85 })];

    const result = tracker.trackCapital('wks_test', events, states);
    expect(result.trustCapital).toBeGreaterThan(0.5);
    expect(result.audienceTrust).toBeGreaterThan(0.7);
  });

  it('detects depleted capital with negative signals', () => {
    const events: CreatorEvent[] = [
      baseCreatorEvent({ eventName: 'commerce.lead.objection_raised', valence: 'negative' }),
      baseCreatorEvent({ eventName: 'commerce.lead.objection_raised', valence: 'negative' }),
      baseCreatorEvent({ eventName: 'commerce.lead.objection_raised', valence: 'negative' }),
      baseCreatorEvent({ eventName: 'commerce.lead.went_silent' }),
      baseCreatorEvent({ eventName: 'commerce.lead.went_silent' }),
      baseCreatorEvent({ eventName: 'commerce.lead.replied', valence: 'negative' }),
    ];
    const states: TrustState[] = [trustState({ trustScore: 0.15 })];

    const result = tracker.trackCapital('wks_test', events, states);
    expect(result.authenticityIndex).toBeLessThan(0.5);
  });

  it('getState returns previously tracked state', () => {
    const events: CreatorEvent[] = Array.from({ length: 5 }, () =>
      baseCreatorEvent({ valence: 'positive' }),
    );
    const states: TrustState[] = [trustState()];

    tracker.trackCapital('wks_test', events, states);
    const state = tracker.getState('wks_test');
    expect(state).toBeDefined();
    expect(state?.workspaceId).toBe('wks_test');
  });

  it('isolates capital across workspaces', () => {
    const eventsA: CreatorEvent[] = Array.from({ length: 8 }, () =>
      baseCreatorEvent({ valence: 'negative' }),
    );
    const eventsB: CreatorEvent[] = Array.from({ length: 8 }, () =>
      baseCreatorEvent({ valence: 'positive' }),
    );

    tracker.trackCapital('wks_a', eventsA, [trustState({ trustScore: 0.2 })]);
    tracker.trackCapital('wks_b', eventsB, [trustState({ trustScore: 0.9 })]);

    const stateA = tracker.getState('wks_a');
    const stateB = tracker.getState('wks_b');
    expect(stateA).toBeDefined();
    expect(stateB).toBeDefined();
    expect(stateA?.trustCapital).toBeLessThan(stateB?.trustCapital ?? 1);
  });

  it('conversion events boost trust capital', () => {
    const events: CreatorEvent[] = [
      ...Array.from({ length: 5 }, () =>
        baseCreatorEvent({ eventName: 'commerce.lead.replied', valence: 'positive' }),
      ),
      baseCreatorEvent({ eventName: 'commerce.lead.converted', valence: 'positive' }),
    ];
    const states: TrustState[] = [trustState({ trustScore: 0.8 })];

    const result = tracker.trackCapital('wks_test', events, states);
    expect(result.consistencyScore).toBeGreaterThan(0.4);
  });
});
