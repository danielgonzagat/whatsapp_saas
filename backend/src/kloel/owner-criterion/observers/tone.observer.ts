/**
 * UTP-OWNER-CRIT-003 — Tone Observer.
 *
 * Observes owner communication tone from spine events: directness,
 * formality, vocabulary complexity, preferred and avoided phrases.
 *
 * Tone is inferred from observable patterns in message replies,
 * campaign creative swaps, and handoff moments. This is behavioral
 * observation, not NLP-based tone analysis — it measures structural
 * signals like message length, reply frequency, and escalation
 * patterns that indirectly reveal tone preferences.
 *
 * Pure function — takes SpineEventRef[] and returns ToneObservation[].
 */

import { randomUUID } from 'node:crypto';
import type { SpineEventRef } from '../../mind/mind.types';
import type { ObserverInput, ToneObservation } from '../owner-criterion.types';

const MIN_EVENTS = 3;

interface ToneSignal {
  readonly messageLength: number;
  readonly isHandoff: boolean;
  readonly occurredAt: string;
}

function extractToneSignals(events: readonly SpineEventRef[]): ToneSignal[] {
  const signals: ToneSignal[] = [];

  for (const e of events) {
    if (e.eventName === 'commerce.whatsapp.message_replied') {
      const payload = e.payload as Record<string, unknown> | undefined;
      const text = typeof payload?.['text'] === 'string' ? payload['text'] : '';
      signals.push({
        messageLength: text.length,
        isHandoff: false,
        occurredAt: e.occurredAt,
      });
    }

    if (e.eventName === 'commerce.whatsapp.handoff_to_human') {
      signals.push({
        messageLength: 0,
        isHandoff: true,
        occurredAt: e.occurredAt,
      });
    }

    if (e.eventName === 'commerce.campaign.creative_swapped') {
      signals.push({
        messageLength: 0,
        isHandoff: false,
        occurredAt: e.occurredAt,
      });
    }
  }

  return signals;
}

function computeDirectness(signals: readonly ToneSignal[]): number {
  if (signals.length === 0) return 0.5;

  const replySignals = signals.filter((s) => !s.isHandoff && s.messageLength > 0);
  if (replySignals.length === 0) return 0.5;

  const avgLength = replySignals.reduce((sum, s) => sum + s.messageLength, 0) / replySignals.length;
  if (avgLength < 50) return 0.85;
  if (avgLength < 150) return 0.65;
  if (avgLength < 300) return 0.45;
  return 0.3;
}

function computeFormality(signals: readonly ToneSignal[]): number {
  if (signals.length === 0) return 0.5;

  const handoffRate = signals.filter((s) => s.isHandoff).length / signals.length;
  if (handoffRate > 0.5) return 0.25;
  if (handoffRate > 0.2) return 0.45;
  return 0.6;
}

function computeVocabularyComplexity(signals: readonly ToneSignal[]): number {
  if (signals.length === 0) return 0.5;

  const replySignals = signals.filter((s) => !s.isHandoff && s.messageLength > 0);
  if (replySignals.length === 0) return 0.5;

  const avgLength = replySignals.reduce((sum, s) => sum + s.messageLength, 0) / replySignals.length;
  if (avgLength > 200) return 0.75;
  if (avgLength > 100) return 0.55;
  return 0.4;
}

function inferPreferredPhrases(signals: readonly ToneSignal[]): readonly string[] {
  const replySignals = signals.filter((s) => !s.isHandoff && s.messageLength > 0);
  if (replySignals.length >= 10) return ['direct_response', 'structured_format'];
  if (replySignals.length >= 5) return ['concise_replies'];
  return [];
}

function inferAvoidedPhrases(signals: readonly ToneSignal[]): readonly string[] {
  const handoffRate = signals.filter((s) => s.isHandoff).length / Math.max(1, signals.length);
  const avoided: string[] = [];
  if (handoffRate > 0.3) avoided.push('excessive_automation');
  return avoided;
}

function computeConfidence(signals: readonly ToneSignal[]): number {
  if (signals.length >= 20) return 0.9;
  if (signals.length >= 10) return 0.7;
  if (signals.length >= 5) return 0.5;
  return 0.3;
}

/**
 * Observe owner tone patterns from spine events.
 *
 * Input: ObserverInput
 * Output: ToneObservation[] — single observation per window
 */
export function observeTone(input: ObserverInput): ToneObservation[] {
  const signals = extractToneSignals(input.events);
  if (signals.length < MIN_EVENTS) return [];

  return [
    {
      observationId: `tone_${randomUUID()}`,
      workspaceId: input.workspaceId,
      directness: computeDirectness(signals),
      formality: computeFormality(signals),
      vocabularyComplexity: computeVocabularyComplexity(signals),
      preferredPhrases: inferPreferredPhrases(signals),
      avoidedPhrases: inferAvoidedPhrases(signals),
      observedAt: new Date(input.nowMs).toISOString(),
      evidenceEventIds: signals.map((_, i) => `tone_signal_${i}_${input.workspaceId}`),
      confidence: computeConfidence(signals),
    },
  ];
}
