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

  it('1: PASS — developing capability with 0 runtimeEvidencePct', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'wip', maturity: 'developing', runtimeEvidencePct: 0 }],
        restricted: [],
      },
    });
    const v = makeNoOverclaimGate().check(gateInput(payload));
    expect(v.status).toBe('PASS');
  });

  it('2: PASS — developing capability with > 0 runtimeEvidencePct', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'wip', maturity: 'developing', runtimeEvidencePct: 5 }],
        restricted: [],
      },
    });
    const v = makeNoOverclaimGate().check(gateInput(payload));
    expect(v.status).toBe('PASS');
  });

  it('3: PASS — operational capability with > 0 runtimeEvidencePct', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'chat', maturity: 'operational', runtimeEvidencePct: 80 }],
        restricted: [],
      },
    });
    const v = makeNoOverclaimGate().check(gateInput(payload));
    expect(v.status).toBe('PASS');
  });

  it('4: PASS — productionReady capability with > 0 runtimeEvidencePct', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'auth', maturity: 'productionReady', runtimeEvidencePct: 100 }],
        restricted: [],
      },
    });
    const v = makeNoOverclaimGate().check(gateInput(payload));
    expect(v.status).toBe('PASS');
  });

  it('5: PASS — multiple valid capabilities with mixed maturities', () => {
    const payload = abiPayload({
      capabilities: {
        available: [
          { capabilityId: 'auth', maturity: 'productionReady', runtimeEvidencePct: 100 },
          { capabilityId: 'chat', maturity: 'operational', runtimeEvidencePct: 80 },
          { capabilityId: 'wip', maturity: 'developing', runtimeEvidencePct: 0 },
        ],
        restricted: [],
      },
    });
    const v = makeNoOverclaimGate().check(gateInput(payload));
    expect(v.status).toBe('PASS');
  });

  it('6: PASS — empty available capabilities array', () => {
    const payload = abiPayload({
      capabilities: { available: [], restricted: [] },
    });
    const v = makeNoOverclaimGate().check(gateInput(payload));
    expect(v.status).toBe('PASS');
  });

  // ──────────────────────────────
  // Group 2 — Basic overclaim FAIL
  // ──────────────────────────────

  it('7: FAIL — operational capability with 0 runtimeEvidencePct', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'chat', maturity: 'operational', runtimeEvidencePct: 0 }],
        restricted: [],
      },
    });
    const v = makeNoOverclaimGate().check(gateInput(payload));
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0]!.detail).toMatch(/without runtime evidence/i);
    expect(v.evidence![0]!.detail).toMatch(/chat/);
  });

  it('8: FAIL — productionReady capability with 0 runtimeEvidencePct', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'auth', maturity: 'productionReady', runtimeEvidencePct: 0 }],
        restricted: [],
      },
    });
    const v = makeNoOverclaimGate().check(gateInput(payload));
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0]!.detail).toMatch(/productionReady/);
  });

  it('9: FAIL — operational capability with missing runtimeEvidencePct', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'chat', maturity: 'operational' }],
        restricted: [],
      },
    });
    const v = makeNoOverclaimGate().check(gateInput(payload));
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0]!.detail).toMatch(/runtimeEvidencePct=undefined/);
  });

  it('10: FAIL — operational capability with negative runtimeEvidencePct', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'chat', maturity: 'operational', runtimeEvidencePct: -1 }],
        restricted: [],
      },
    });
    const v = makeNoOverclaimGate().check(gateInput(payload));
    expect(v.status).toBe('FAIL');
  });

  it('11: FAIL — mixed capabilities, one operational with 0 evidence among valid', () => {
    const payload = abiPayload({
      capabilities: {
        available: [
          { capabilityId: 'auth', maturity: 'productionReady', runtimeEvidencePct: 100 },
          { capabilityId: 'chat', maturity: 'operational', runtimeEvidencePct: 0 },
          { capabilityId: 'wip', maturity: 'developing', runtimeEvidencePct: 0 },
        ],
        restricted: [],
      },
    });
    const v = makeNoOverclaimGate().check(gateInput(payload));
    expect(v.status).toBe('FAIL');
    expect(v.reason!).toMatch(/1 capability overclaim/);
  });

  // ──────────────────────────────
  // Group 3 — Registry cross-reference
  // ──────────────────────────────

  it('12: PASS — all ABI capabilities exist in registry', () => {
    const payload = abiPayload({
      capabilities: {
        available: [
          { capabilityId: 'auth', maturity: 'productionReady', runtimeEvidencePct: 100 },
          { capabilityId: 'chat', maturity: 'operational', runtimeEvidencePct: 80 },
        ],
        restricted: [],
      },
    });
    const reg = registrySnapshot([
      { id: 'auth', consecutiveFailures: 0 },
      { id: 'chat', consecutiveFailures: 0 },
    ]);
    const v = makeNoOverclaimGate().check(gateInput(payload, reg));
    expect(v.status).toBe('PASS');
  });

  it('13: FAIL — capability in ABI but not in registry', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'magic', maturity: 'operational', runtimeEvidencePct: 80 }],
        restricted: [],
      },
    });
    const reg = registrySnapshot([{ id: 'auth', consecutiveFailures: 0 }]);
    const v = makeNoOverclaimGate().check(gateInput(payload, reg));
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0]!.detail).toMatch(/not found in capability-registry/);
  });

  it('14: FAIL — multiple phantom capabilities in ABI', () => {
    const payload = abiPayload({
      capabilities: {
        available: [
          { capabilityId: 'auth', maturity: 'productionReady', runtimeEvidencePct: 100 },
          { capabilityId: 'magic', maturity: 'operational', runtimeEvidencePct: 80 },
          { capabilityId: 'invisible', maturity: 'operational', runtimeEvidencePct: 60 },
        ],
        restricted: [],
      },
    });
    const reg = registrySnapshot([{ id: 'auth', consecutiveFailures: 0 }]);
    const v = makeNoOverclaimGate().check(gateInput(payload, reg));
    expect(v.status).toBe('FAIL');
    expect(v.reason!).toMatch(/2 capability overclaim/);
  });

  // ──────────────────────────────
  // Group 4 — Degraded capability
  // ──────────────────────────────

  it('15: PASS — productionReady capability with consecutiveFailures < 3', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'auth', maturity: 'productionReady', runtimeEvidencePct: 100 }],
        restricted: [],
      },
    });
    const reg = registrySnapshot([{ id: 'auth', consecutiveFailures: 2 }]);
    const v = makeNoOverclaimGate().check(gateInput(payload, reg));
    expect(v.status).toBe('PASS');
  });

  it('16: FAIL — productionReady capability with consecutiveFailures === 3', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'auth', maturity: 'productionReady', runtimeEvidencePct: 100 }],
        restricted: [],
      },
    });
    const reg = registrySnapshot([{ id: 'auth', consecutiveFailures: 3 }]);
    const v = makeNoOverclaimGate().check(gateInput(payload, reg));
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0]!.detail).toMatch(/3 consecutive failures/);
  });

  it('17: FAIL — productionReady capability with consecutiveFailures > 3', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'auth', maturity: 'productionReady', runtimeEvidencePct: 100 }],
        restricted: [],
      },
    });
    const reg = registrySnapshot([{ id: 'auth', consecutiveFailures: 7 }]);
    const v = makeNoOverclaimGate().check(gateInput(payload, reg));
    expect(v.status).toBe('FAIL');
    expect(v.evidence![0]!.detail).toMatch(/7 consecutive failures/);
  });

  it('18: PASS — developing capability with consecutiveFailures >= 3 (not overclaim)', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'wip', maturity: 'developing', runtimeEvidencePct: 5 }],
        restricted: [],
      },
    });
    const reg = registrySnapshot([{ id: 'wip', consecutiveFailures: 10 }]);
    const v = makeNoOverclaimGate().check(gateInput(payload, reg));
    expect(v.status).toBe('PASS');
  });

  it('19: PASS — operational capability with consecutiveFailures >= 3 (not degraded rule)', () => {
    const payload = abiPayload({
      capabilities: {
        available: [{ capabilityId: 'chat', maturity: 'operational', runtimeEvidencePct: 80 }],
        restricted: [],
      },
    });
    const reg = registrySnapshot([{ id: 'chat', consecutiveFailures: 5 }]);
    const v = makeNoOverclaimGate().check(gateInput(payload, reg));
    expect(v.status).toBe('PASS');
  });

  // ──────────────────────────────
  // Group 5 — Edge cases
  // ──────────────────────────────

  it('20: FAIL — null payload', () => {
    const v = makeNoOverclaimGate().check(gateInput(null));
    expect(v.status).toBe('FAIL');
    expect(v.reason).toMatch(/not a plain object/);
  });

  it('21: FAIL — undefined payload', () => {
    const v = makeNoOverclaimGate().check(gateInput(undefined));
    expect(v.status).toBe('FAIL');
  });

  it('22: FAIL — string payload', () => {
    const v = makeNoOverclaimGate().check(gateInput('not-an-object'));
    expect(v.status).toBe('FAIL');
  });
