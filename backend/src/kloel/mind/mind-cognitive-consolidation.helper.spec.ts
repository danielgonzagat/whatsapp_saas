/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */

/**
 * Proves the cognitive consolidation pass fires the previously-dormant
 * recovery / role / offer detectors over the long-tick's events and emits a
 * single throttled `cognition.consolidation_scan` summary — without ever
 * throwing into the mind tick.
 */
import { Logger } from '@nestjs/common';
import type { SpineEventRef } from './mind.types';
import {
  isCognitiveConsolidationEnabled,
  runCognitiveConsolidation,
} from './mind-cognitive-consolidation.helper';

const WS = 'ws-test';
const NOW = 1_700_000_000_000;

function handoffEvents(n: number): SpineEventRef[] {
  return Array.from({ length: n }, (_, i) => ({
    eventId: `evt_${i}`,
    eventName: 'commerce.whatsapp.handoff_to_human',
    workspaceId: WS,
    occurredAt: new Date(NOW - i * 1000).toISOString(),
    truthMode: 'observed' as const,
  }));
}

function paymentEvent(name: string, amountCents: string, i: number): SpineEventRef {
  return {
    eventId: `pay_${i}`,
    eventName: name,
    workspaceId: WS,
    occurredAt: new Date(NOW - i * 1000).toISOString(),
    truthMode: 'observed' as const,
    payload: { amountCents },
  };
}

describe('runCognitiveConsolidation', () => {
  let emit: jest.Mock;
  let spine: { emit: jest.Mock };
  let throttle: Map<string, number>;

  beforeEach(() => {
    emit = jest.fn().mockResolvedValue({});
    spine = { emit };
    throttle = new Map<string, number>();
  });

  it('returns null and does not emit when there are no events', async () => {
    const out = await runCognitiveConsolidation({
      events: [],
      workspaceId: WS,
      nowMs: NOW,
      spine,
      throttle,
    });

    expect(out).toBeNull();
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits one cognition.consolidation_scan summary on a material recovery finding', async () => {
    const out = await runCognitiveConsolidation({
      events: handoffEvents(2),
      workspaceId: WS,
      nowMs: NOW,
      spine,
      throttle,
    });

    expect(emit).toHaveBeenCalledTimes(1);
    const event = emit.mock.calls[0][0];
    expect(event.eventName).toBe('cognition.consolidation_scan');
    expect(event.workspaceId).toBe(WS);
    expect(event.truthMode).toBe('inferred');
    expect(event.provenance.processor).toBe('mind-cognitive-consolidation');
    expect(event.payload.errorCount).toBeGreaterThanOrEqual(1);
    // Defensibility detectors run and ride along as payload context.
    expect(event.payload).toHaveProperty('positioningSignals');
    expect(event.payload).toHaveProperty('socialProofSignals');
    // ComMem knowledge-capital snapshot rides along too.
    expect(event.payload).toHaveProperty('knowledgeProjections');
    expect(event.payload).toHaveProperty('knowledgeAuditable');
    // Hypproof market-entry decision count rides along too.
    expect(event.payload).toHaveProperty('marketEntryDecisions');
    // Cash + goal-field snapshots ride along too.
    expect(event.payload).toHaveProperty('cashEntriesObserved');
    expect(event.payload).toHaveProperty('goalCandidates');
    expect(out).not.toBeNull();
    expect(out?.['errorCount']).toBeGreaterThanOrEqual(1);
  });

  it('derives observed cash position from payment events (refund as outflow)', async () => {
    const events: SpineEventRef[] = [
      ...handoffEvents(1), // material trigger so the summary emits
      paymentEvent('commerce.payment.approved', '10000', 1),
      paymentEvent('commerce.payment.approved', '5000', 2),
      paymentEvent('commerce.payment.refunded', '3000', 3),
    ];

    await runCognitiveConsolidation({ events, workspaceId: WS, nowMs: NOW, spine, throttle });

    const event = emit.mock.calls[0][0];
    expect(event.payload.cashEntriesObserved).toBe(3);
    expect(event.payload.cashBalanceCents).toBe('12000'); // 10000 + 5000 - 3000
  });

  it('throttles a second run within the window (no duplicate emit)', async () => {
    await runCognitiveConsolidation({
      events: handoffEvents(2),
      workspaceId: WS,
      nowMs: NOW,
      spine,
      throttle,
      throttleMs: 60_000,
    });
    expect(emit).toHaveBeenCalledTimes(1);

    const second = await runCognitiveConsolidation({
      events: handoffEvents(2),
      workspaceId: WS,
      nowMs: NOW + 30_000, // inside the 60s window
      spine,
      throttle,
      throttleMs: 60_000,
    });

    expect(second).toBeNull();
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('emits again once the throttle window has elapsed', async () => {
    await runCognitiveConsolidation({
      events: handoffEvents(2),
      workspaceId: WS,
      nowMs: NOW,
      spine,
      throttle,
      throttleMs: 60_000,
    });

    await runCognitiveConsolidation({
      events: handoffEvents(2),
      workspaceId: WS,
      nowMs: NOW + 120_000, // past the window
      spine,
      throttle,
      throttleMs: 60_000,
    });

    expect(emit).toHaveBeenCalledTimes(2);
  });

  it('marks the throttle but does not emit on a quiet workspace (no findings)', async () => {
    const quiet: SpineEventRef[] = [
      {
        eventId: 'evt_quiet',
        eventName: 'system.heartbeat',
        workspaceId: WS,
        occurredAt: new Date(NOW).toISOString(),
        truthMode: 'observed',
      },
    ];

    const out = await runCognitiveConsolidation({
      events: quiet,
      workspaceId: WS,
      nowMs: NOW,
      spine,
      throttle,
    });

    expect(out).toBeNull();
    expect(emit).not.toHaveBeenCalled();
    expect(throttle.get(WS)).toBe(NOW); // throttle still marked
  });

  it('never throws when the sink rejects', async () => {
    emit.mockRejectedValue(new Error('spine down'));

    await expect(
      runCognitiveConsolidation({
        events: handoffEvents(2),
        workspaceId: WS,
        nowMs: NOW,
        spine,
        throttle,
        logger: new Logger('test'),
      }),
    ).resolves.not.toThrow();
  });
});

describe('isCognitiveConsolidationEnabled', () => {
  const original = process.env.KLOEL_COGNITIVE_CONSOLIDATION_ENABLED;
  afterEach(() => {
    if (original === undefined) {
      delete process.env.KLOEL_COGNITIVE_CONSOLIDATION_ENABLED;
    } else {
      process.env.KLOEL_COGNITIVE_CONSOLIDATION_ENABLED = original;
    }
  });

  it('defaults ON when unset', () => {
    delete process.env.KLOEL_COGNITIVE_CONSOLIDATION_ENABLED;
    expect(isCognitiveConsolidationEnabled()).toBe(true);
  });

  it('is OFF only on explicit =false', () => {
    process.env.KLOEL_COGNITIVE_CONSOLIDATION_ENABLED = 'false';
    expect(isCognitiveConsolidationEnabled()).toBe(false);
  });

  it('treats any other value as ON', () => {
    process.env.KLOEL_COGNITIVE_CONSOLIDATION_ENABLED = 'true';
    expect(isCognitiveConsolidationEnabled()).toBe(true);
  });
});
