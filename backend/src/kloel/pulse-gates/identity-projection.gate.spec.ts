import { makeIdentityProjectionGate } from './identity-projection.gate';

/**
 * UTP-PULSE-003 contract spec — identity-projection gate.
 *
 * 22 scenarios: 8 positive (PASS) + 14 negative (FAIL).
 *
 * Coverage:
 *   - audience='public' with etymology/origin exposed
 *   - audience='technical'/'internal'/'origin' allowing etymology
 *   - invalid audience value
 *   - canonicalName !== 'Kloel'
 *   - identityProjection missing or non-object
 *   - truthMode inconsistency between lineage and identityProjection
 *   - compound failures (multiple issues in one payload)
 *   - edge cases: empty strings, null payload, array payload
 */

// ─── helpers ────────────────────────────────────────────────────────────

function gate(mode: 'log_only' | 'hard_fail' = 'hard_fail') {
  return makeIdentityProjectionGate(mode);
}

function validPayload(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    abiVersion: '1.0.0',
    lineage: {
      canonicalName: 'Kloel',
      genesisEventId: 'ev-genesis-001',
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
        { capabilityId: 'lineage', maturity: 'developing', runtimeEvidencePct: 5 },
      ],
      restricted: [],
    },
    valence: {
      recentTrace: [],
      aggregatedMood: {
        positive: 0,
        negative: 0,
        neutral: 1,
        ambiguous: 0,
        windowHours: 24,
      },
    },
    pulseTruth: {
      noOverclaimStatus: 'PASS',
      capabilityHealthScore: 1,
      gates: [],
      certificationVerdict: {
        verdict: 'INSUFFICIENT_EVIDENCE',
        score: 0,
        measuredAt: '2026-05-14T12:00:00.000Z',
      },
      overclaimRisk: 0,
    },
    currentInput: {
      raw: 'olá',
      channel: 'whatsapp',
      arrivalTimestamp: '2026-05-14T12:00:00.000Z',
    },
    ...overrides,
  };
}

// ─── positive scenarios (8) ─────────────────────────────────────────────

describe('identity-projection gate — POSITIVE (PASS)', () => {
  it('PASS: valid ABI with public audience, no etymology/origin', () => {
    const v = gate().check(validPayload());
    expect(v.status).toBe('PASS');
    expect(v.mode).toBe('hard_fail');
  });

  it('PASS: technical audience with etymology present (allowed)', () => {
    const payload = validPayload({
      identityProjection: { audience: 'technical', currentMaturity: 'developing', truthMode: 'observed' },
      lineage: {
        canonicalName: 'Kloel',
        genesisEventId: 'ev-genesis-001',
        lineageStatus: 'intact',
        operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
        capabilities: ['lineage'],
        etymology: 'forjado-em-beta',
      },
    });
    const v = gate().check(payload);
    expect(v.status).toBe('PASS');
  });

  it('PASS: internal audience', () => {
    const payload = validPayload({
      identityProjection: { audience: 'internal', currentMaturity: 'developing', truthMode: 'observed' },
    });
    const v = gate().check(payload);
    expect(v.status).toBe('PASS');
  });

  it('PASS: origin audience with etymology and origin present (allowed)', () => {
    const payload = validPayload({
      identityProjection: { audience: 'origin', currentMaturity: 'developing', truthMode: 'inferred' },
      lineage: {
        canonicalName: 'Kloel',
        genesisEventId: 'ev-genesis-001',
        lineageStatus: 'intact',
        operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
        capabilities: ['lineage'],
        etymology: 'forjado-em-beta',
        origin: 'sys-alpha-v1',
      },
    });
    const v = gate().check(payload);
    expect(v.status).toBe('PASS');
  });

  it('PASS: consistent truthMode between lineage and identityProjection', () => {
    const payload = validPayload({
      identityProjection: { audience: 'public', currentMaturity: 'developing', truthMode: 'inferred' },
      lineage: {
        canonicalName: 'Kloel',
        genesisEventId: 'ev-genesis-001',
        lineageStatus: 'intact',
        operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
        capabilities: ['lineage'],
        truthMode: 'inferred',
      },
    });
    const v = gate().check(payload);
    expect(v.status).toBe('PASS');
  });

  it('PASS: public audience, lineage has empty-string etymology (no leak)', () => {
    const payload = validPayload({
      lineage: {
        canonicalName: 'Kloel',
        genesisEventId: 'ev-genesis-001',
        lineageStatus: 'intact',
        operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
        capabilities: ['lineage'],
        etymology: '',
      },
    });
    const v = gate().check(payload);
    expect(v.status).toBe('PASS');
  });

  it('PASS: public audience, lineage has empty-string origin (no leak)', () => {
    const payload = validPayload({
      lineage: {
        canonicalName: 'Kloel',
        genesisEventId: 'ev-genesis-001',
        lineageStatus: 'intact',
        operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
        capabilities: ['lineage'],
        origin: '',
      },
    });
    const v = gate().check(payload);
    expect(v.status).toBe('PASS');
  });

  it('PASS: public audience, lineage lacks etymology/origin keys entirely', () => {
    const payload = validPayload({
      identityProjection: { audience: 'public', currentMaturity: 'developing', truthMode: 'projected' },
      lineage: {
        canonicalName: 'Kloel',
        genesisEventId: 'ev-genesis-001',
        lineageStatus: 'intact',
        operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
        capabilities: ['lineage'],
      },
    });
    const v = gate().check(payload);
    expect(v.status).toBe('PASS');
  });
});

// ─── negative scenarios (14) ────────────────────────────────────────────
