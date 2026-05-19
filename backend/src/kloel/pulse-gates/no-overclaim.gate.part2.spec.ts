import type { CapabilityRegistrySnapshot } from '../capability-registry/capability-registry.types';
import { makeNoOverclaimGate, NoOverclaimInput } from './no-overclaim.gate';

function abiPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    abiVersion: '1.0.0',
    lineage: {
      canonicalName: 'Kloel',
      genesisEventId: 'genesis-1',
      lineageStatus: 'intact',
      operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
      capabilities: ['lineage'],
    },
    identityProjection: {
      audience: 'public',
      currentMaturity: 'developing',
      truthMode: 'observed',
    },
    perception: { currentSnapshot: { channel: 'whatsapp' }, recentSalientEvents: [] },
    beliefs: [],
    predictions: { active: [], recentSurprises: [] },
    attention: { candidates: [] },
    memory: { workingMemory: [], episodicRefs: [], consolidatedRefs: [] },
    capabilities: {
      available: [
        { capabilityId: 'lineage', maturity: 'operational', runtimeEvidencePct: 42 },
      ],
      restricted: [],
    },
    valence: {
      recentTrace: [],
      aggregatedMood: { positive: 0, negative: 0, neutral: 1, ambiguous: 0, windowHours: 24 },
    },
    pulseTruth: {
      noOverclaimStatus: 'PASS',
      capabilityHealthScore: 1,
      gates: [],
      certificationVerdict: { verdict: 'INSUFFICIENT_EVIDENCE', score: 0, measuredAt: new Date().toISOString() },
      overclaimRisk: 0,
    },
    currentInput: { raw: 'test', channel: 'test', arrivalTimestamp: new Date().toISOString() },
    ...overrides,
  };
}

function registrySnapshot(
  records: { id: string; consecutiveFailures: number }[],
): CapabilityRegistrySnapshot {
  return {
    snapshotAt: new Date().toISOString(),
    records: records.map((r) => ({
      id: r.id,
      maturity: 'productionReady',
      runtimeEvidencePct: 50,
      lastInvokedAt: null,
      invokeCount: 0,
      successCount: 0,
      failureCount: r.consecutiveFailures,
      consecutiveFailures: r.consecutiveFailures,
      auditTrail: [],
    })),
  };
}

function gateInput(
  abi: unknown,
  registry?: CapabilityRegistrySnapshot,
): NoOverclaimInput {
  return { abiPayload: abi, registrySnapshot: registry };
}

const HARD_FAIL = 'hard_fail' as const;

describe('no-overclaim gate', () => {
  // ──────────────────────────────
  // Group 1 — Basic overclaim PASS
  // ──────────────────────────────

  it('23: PASS — no registry snapshot, still runs basic checks', () => {
    const payload = abiPayload({
      capabilities: {
        available: [
          { capabilityId: 'auth', maturity: 'productionReady', runtimeEvidencePct: 100 },
        ],
        restricted: [],
      },
    });
    const v = makeNoOverclaimGate().check({ abiPayload: payload });
    expect(v.status).toBe('PASS');
  });

  it('24: FAIL — no registry snapshot, operational with 0 evidence still fails', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'chat', maturity: 'operational', runtimeEvidencePct: 0 }],
        restricted: [],
      },
    });
    const v = makeNoOverclaimGate().check({ abiPayload: payload });
    expect(v.status).toBe('FAIL');
  });

  // ──────────────────────────────
  // Group 6 — Mode enforcement
  // ──────────────────────────────

  it('25: default mode is hard_fail', () => {
    const gate = makeNoOverclaimGate();
    expect(gate.mode).toBe('hard_fail');
  });

  it('26: explicit log_only mode is respected', () => {
    const gate = makeNoOverclaimGate('log_only');
    expect(gate.mode).toBe('log_only');
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'chat', maturity: 'operational', runtimeEvidencePct: 0 }],
        restricted: [],
      },
    });
    const v = gate.check(gateInput(payload));
    expect(v.status).toBe('FAIL');
    expect(v.mode).toBe('log_only');
  });

  it('27: hard_fail verdict carries hard_fail mode', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'chat', maturity: 'operational', runtimeEvidencePct: 0 }],
        restricted: [],
      },
    });
    const v = makeNoOverclaimGate().check(gateInput(payload));
    expect(v.status).toBe('FAIL');
    expect(v.mode).toBe('hard_fail');
  });

  // ──────────────────────────────
  // Group 7 — Compound failures
  // ──────────────────────────────

  it('28: FAIL — all three overclaim types detected at once', () => {
    const payload = abiPayload({
      capabilities: {
        available: [
          { capabilityId: 'auth', maturity: 'productionReady', runtimeEvidencePct: 0 },
          { capabilityId: 'magic', maturity: 'operational', runtimeEvidencePct: 50 },
          { capabilityId: 'chat', maturity: 'productionReady', runtimeEvidencePct: 80 },
        ],
        restricted: [],
      },
    });
    const reg = registrySnapshot([
      { id: 'auth', consecutiveFailures: 3 },
      { id: 'chat', consecutiveFailures: 3 },
    ]);
    const v = makeNoOverclaimGate().check(gateInput(payload, reg));
    expect(v.status).toBe('FAIL');
    expect(v.reason!).toMatch(/4 capability overclaim/);
  });

  it('29: PASS — capabilities missing from abiPayload (no capabilities key)', () => {
    const payload = abiPayload();
    delete payload['capabilities'];
    const v = makeNoOverclaimGate().check(gateInput(payload));
    expect(v.status).toBe('PASS');
  });

  it('30: PASS — capabilities with null available', () => {
    const payload = abiPayload({
      capabilities: { available: null, restricted: [] },
    });
    const v = makeNoOverclaimGate().check(gateInput(payload));
    expect(v.status).toBe('PASS');
  });

  it('31: PASS — capability with unknown capabilityId treated as "?"', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ maturity: 'operational', runtimeEvidencePct: 80 }],
        restricted: [],
      },
    });
    const v = makeNoOverclaimGate().check(gateInput(payload));
    expect(v.status).toBe('PASS');
  });
});
