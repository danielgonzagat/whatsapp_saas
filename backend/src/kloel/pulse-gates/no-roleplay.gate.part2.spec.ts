import { GENESIS_EVENT } from '../lineage/genesis-event';
import { makeNoRoleplayGate } from './no-roleplay.gate';
import type { GateVerdict } from './pulse-gates.types';

/**
 * UTP-PULSE-001 — no-roleplay gate contract spec.
 *
 * Covers >=25 scenarios:
 *   - Positive (PASS): clean ABI, role-play language in currentInput only.
 *   - Negative (FAIL): role-play patterns in identityProjection / lineage
 *     or any other non-currentInput field.
 *
 * DISTINCTION: user prose in `currentInput` is allowed to contain
 * role-play language. Role-play patterns found in Kloel's own
 * identity configuration (identityProjection, lineage) are BLOCKED.
 */

function validAbi(): Record<string, unknown> {
  return {
    abiVersion: '1.0.0',
    lineage: {
      canonicalName: 'Kloel',
      genesisEventId: GENESIS_EVENT.eventId,
      lineageStatus: 'intact',
      operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
      capabilities: ['lineage'],
    },
    identityProjection: {
      audience: 'public',
      currentMaturity: 'developing',
      truthMode: 'observed',
    },
    perception: {
      currentSnapshot: { channel: 'whatsapp' },
      recentSalientEvents: [],
    },
    beliefs: [],
    predictions: { active: [], recentSurprises: [] },
    attention: { candidates: [] },
    memory: { workingMemory: [], episodicRefs: [], consolidatedRefs: [] },
    capabilities: {
      available: [
        { capabilityId: 'lineage', maturity: 'developing', runtimeEvidencePct: 5 },
      ],
      restricted: [],
    },
    valence: {
      recentTrace: [],
      aggregatedMood: {
        positive: 0, negative: 0, neutral: 1, ambiguous: 0, windowHours: 24,
      },
    },
    pulseTruth: {
      noOverclaimStatus: 'PASS',
      capabilityHealthScore: 1,
      gates: [],
      certificationVerdict: {
        verdict: 'INSUFFICIENT_EVIDENCE',
        score: 0,
        measuredAt: '2026-05-13T20:00:00.000Z',
      },
      overclaimRisk: 0,
    },
    currentInput: {
      raw: 'olá',
      channel: 'whatsapp',
      arrivalTimestamp: '2026-05-13T20:14:31.880Z',
    },
  };
}

function check(payload: unknown, mode?: 'log_only' | 'hard_fail'): GateVerdict {
  return makeNoRoleplayGate(mode).check(payload);
}

function tamperCurrentInput(payload: Record<string, unknown>, raw: string): Record<string, unknown> {
  const out = { ...payload };
  out['currentInput'] = { ...(payload['currentInput'] as Record<string, unknown>), raw };
  return out;
}

function tamperIdentityProjection(payload: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };
  out['identityProjection'] = { ...(payload['identityProjection'] as Record<string, unknown>), ...patch };
  return out;
}

function tamperLineage(payload: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };
  out['lineage'] = { ...(payload['lineage'] as Record<string, unknown>), ...patch };
  return out;
}

function tamperPerception(payload: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const out = { ...payload };
  out['perception'] = { ...(payload['perception'] as Record<string, unknown>), ...patch };
  return out;
}

// ─── Positive (PASS) scenarios ────────────────────────────────────────

describe('no-roleplay gate — mode contract', () => {
  it('38. default mode is hard_fail', () => {
    const v = makeNoRoleplayGate().check(validAbi());
    expect(v.mode).toBe('hard_fail');
  });

  it('39. explicitly set log_only mode is respected', () => {
    const v = makeNoRoleplayGate('log_only').check(validAbi());
    expect(v.mode).toBe('log_only');
  });

  it('40. FAIL verdict carries hard_fail mode when configured', () => {
    const p = tamperIdentityProjection(validAbi(), { roleNote: 'You are a sales agent.' });
    const v = makeNoRoleplayGate('hard_fail').check(p);
    expect(v.status).toBe('FAIL');
    expect(v.mode).toBe('hard_fail');
  });

  it('41. PASS verdict includes no reason field', () => {
    const v = check(validAbi());
    expect(v.status).toBe('PASS');
    expect(v.reason).toBeUndefined();
  });

  it('42. FAIL verdict includes reason and evidence', () => {
    const p = tamperIdentityProjection(validAbi(), { roleNote: 'Você é um assistente.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
    expect(v.reason).toBeDefined();
    expect(v.evidence).toBeDefined();
    expect(v.evidence!.length).toBeGreaterThan(0);
  });

  it('43. FAIL verdict evidence contains path and detail', () => {
    const p = tamperIdentityProjection(validAbi(), { roleNote: 'Você é um assistente.' });
    const v = check(p);
    expect(v.status).toBe('FAIL');
    const ev = v.evidence![0]!;
    expect(ev.path).toBeDefined();
    expect(ev.path).toContain('identityProjection');
    expect(ev.detail).toContain('roleplay pattern');
  });

  it('44. measuredAt is a valid ISO date', () => {
    const v = check(validAbi());
    expect(() => new Date(v.measuredAt)).not.toThrow();
    expect(new Date(v.measuredAt).toISOString()).toBe(v.measuredAt);
  });

  it('45. measuredBy is the correct gate identifier', () => {
    const v = makeNoRoleplayGate().check(validAbi());
    expect(v.measuredBy).toBe('no-roleplay.gate');
  });
});
