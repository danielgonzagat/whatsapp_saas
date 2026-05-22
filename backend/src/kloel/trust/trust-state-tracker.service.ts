/**
 * UTP-TRUST-001 — Trust State Tracker
 *
 * Composes fatigue, desperation, timing, brand-protection, silence,
 * handoff, and recovery detectors into a single per-conversation trust
 * state. The tracker accepts recent spine events and recomputes the
 * full TrustState for the conversation.
 *
 * State is held in-memory (Map keyed by conversationRef). In a later
 * Onda, persistence moves to Prisma via a repository abstraction.
 */

import { Injectable, Logger } from '@nestjs/common';

import { detectFatigue } from './fatigue-detector';
import { detectDesperation } from './desperation-detector';
import { evaluateBrandRisk } from './brand-protection.guard';
import { decideSilence } from './silence-as-action.policy';
import { shouldHandoff } from './human-handoff.trigger';
import { proposeRecoveryActions } from './trust-recovery.tactics';

import type {
  TrustState,
  ConversationRef,
  TrustEvent,
  SilenceDecision,
  HandoffDecision,
  RecoveryAction,
  BrandRiskFlag,
} from './trust.types';
import type { SpineEventRef } from '../mind/mind.types';
import { toTrustEvent } from './trust.types';

const INITIAL_TRUST_SCORE = 0.75;
const TRUST_DECAY_PER_NEGATIVE_EVENT = 0.05;
const TRUST_BOOST_PER_POSITIVE_EVENT = 0.03;
const TRUST_FLOOR = 0.0;
const TRUST_CEILING = 1.0;
const FATIGUE_DECAY_PER_MINUTE = 0.001;

@Injectable()
export class TrustStateTrackerService {
  private readonly logger = new Logger(TrustStateTrackerService.name);
  private readonly store = new Map<string, TrustState>();

  private conversationKey(cr: ConversationRef): string {
    return `${cr.entityType}:${cr.entityId}`;
  }

  trackConversation(
    workspaceId: string,
    conversationRef: ConversationRef,
    recentEvents: readonly SpineEventRef[],
  ): TrustState {
    const key = this.conversationKey(conversationRef);
    const current = this.store.get(key) ?? this.defaultState();
    const trustEvents = recentEvents.map(toTrustEvent);

    const fatigue = detectFatigue(trustEvents);
    const outbound = trustEvents.filter((e) =>
      e.eventName === 'commerce.whatsapp.message_replied',
    );
    const desperation = detectDesperation(outbound);

    const now = new Date();
    const nowIso = now.toISOString();

    const minutesSinceLast = this.minutesSince(
      current.lastInteractionAt,
      now,
    );
    const fatigueDecay = minutesSinceLast * FATIGUE_DECAY_PER_MINUTE;

    const silentCount =
      current.silentInteractionsCount +
      (this.hasNewInboundSilence(trustEvents, current) ? 1 : 0);

    let trustScore = this.adjustTrustScore(
      current.trustScore,
      trustEvents,
    );

    const brandRisk = this.collectBrandRisk(
      outbound,
      current.brandRiskFlags,
    );

    if (brandRisk.length > 0) {
      trustScore = Math.max(TRUST_FLOOR, trustScore - 0.08);
    }

    const state: TrustState = {
      trustScore,
      fatigueLevel: Math.max(0, fatigue.level - fatigueDecay),
      desperationLevel: desperation.level,
      lastInteractionAt: nowIso,
      silentInteractionsCount: silentCount,
      brandRiskFlags: brandRisk,
    };

    this.store.set(key, state);

    if (state.trustScore <= 0.2) {
      this.logger.warn(
        `workspace=${workspaceId} conversation=${JSON.stringify(conversationRef)} ` +
          `trust score critically low: ${state.trustScore.toFixed(2)}`,
      );
    }

    return state;
  }

  getState(conversationRef: ConversationRef): TrustState | undefined {
    return this.store.get(this.conversationKey(conversationRef));
  }

  getFullAssessment(
    workspaceId: string,
    conversationRef: ConversationRef,
    recentEvents: readonly SpineEventRef[],
  ): {
    readonly state: TrustState;
    readonly silence: SilenceDecision;
    readonly handoff: HandoffDecision;
    readonly recovery: readonly RecoveryAction[];
  } {
    const state = this.trackConversation(workspaceId, conversationRef, recentEvents);
    return {
      state,
      silence: decideSilence(state),
      handoff: shouldHandoff(state),
      recovery: proposeRecoveryActions(state),
    };
  }

  private defaultState(): TrustState {
    return {
      trustScore: INITIAL_TRUST_SCORE,
      fatigueLevel: 0,
      desperationLevel: 0,
      lastInteractionAt: new Date(0).toISOString(),
      silentInteractionsCount: 0,
      brandRiskFlags: [],
    };
  }

  private adjustTrustScore(
    current: number,
    events: readonly TrustEvent[],
  ): number {
    let score = current;

    for (const ev of events) {
      if (ev.valence === 'positive') {
        score += TRUST_BOOST_PER_POSITIVE_EVENT;
      } else if (ev.valence === 'negative') {
        score -= TRUST_DECAY_PER_NEGATIVE_EVENT;
      }

      if (ev.eventName === 'commerce.lead.replied') {
        score += 0.01;
      }
      if (ev.eventName === 'commerce.lead.went_silent') {
        score -= 0.06;
      }
      if (ev.eventName === 'commerce.whatsapp.handoff_to_human') {
        score -= 0.04;
      }
    }

    return Math.max(TRUST_FLOOR, Math.min(TRUST_CEILING, score));
  }

  private hasNewInboundSilence(
    events: readonly TrustEvent[],
    current: TrustState,
  ): boolean {
    return (
      events.some((e) => e.eventName === 'commerce.lead.went_silent') &&
      current.silentInteractionsCount === 0
    );
  }

  private collectBrandRisk(
    outbound: readonly TrustEvent[],
    existing: readonly BrandRiskFlag[],
  ): readonly BrandRiskFlag[] {
    const all = [...existing];
    for (const ev of outbound) {
      const text =
        (ev.payload?.['messageBody'] as string) ??
        (ev.payload?.['body'] as string) ??
        (ev.payload?.['text'] as string) ??
        '';
      if (text) {
        const newFlags = evaluateBrandRisk(text);
        for (const f of newFlags) {
          if (!all.some((a) => a.kind === f.kind)) {
            all.push(f);
          }
        }
      }
    }
    return all;
  }

  private minutesSince(iso: string, now: Date): number {
    const ms = now.getTime() - new Date(iso).getTime();
    return Math.max(0, ms / 60000);
  }
}
