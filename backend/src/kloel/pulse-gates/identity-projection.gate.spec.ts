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

describe('identity-projection gate — NEGATIVE (FAIL)', () => {
  it('FAIL: public audience with etymology exposed', () => {
    const payload = validPayload({
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
    expect(v.status).toBe('FAIL');
    expect(v.mode).toBe('hard_fail');
    expect(v.reason).toMatch(/identity-projection issue/);
    expect(v.evidence).toBeDefined();
    const etymologyEvidence = v.evidence?.find((e) => e.path === '$.lineage.etymology');
    expect(etymologyEvidence).toBeDefined();
    expect(etymologyEvidence?.detail).toMatch(/spiritual etymology/);
  });

  it('FAIL: public audience with origin exposed', () => {
    const payload = validPayload({
      lineage: {
        canonicalName: 'Kloel',
        genesisEventId: 'ev-genesis-001',
        lineageStatus: 'intact',
        operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
        capabilities: ['lineage'],
        origin: 'sys-alpha-v1',
      },
    });
    const v = gate().check(payload);
    expect(v.status).toBe('FAIL');
    const originEvidence = v.evidence?.find((e) => e.path === '$.lineage.origin');
    expect(originEvidence).toBeDefined();
    expect(originEvidence?.detail).toMatch(/spiritual origin/);
  });

  it('FAIL: public audience with BOTH etymology AND origin exposed (2 issues)', () => {
    const payload = validPayload({
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
    expect(v.status).toBe('FAIL');
    expect(v.reason).toMatch(/2 identity-projection issue/);
    const paths = v.evidence?.map((e) => e.path) ?? [];
    expect(paths).toContain('$.lineage.etymology');
    expect(paths).toContain('$.lineage.origin');
  });

  it('FAIL: invalid audience value', () => {
    const payload = validPayload({
      identityProjection: { audience: 'pirate', currentMaturity: 'developing', truthMode: 'observed' },
    });
    const v = gate().check(payload);
    expect(v.status).toBe('FAIL');
    const audienceEvidence = v.evidence?.find((e) => e.path === '$.identityProjection.audience');
    expect(audienceEvidence).toBeDefined();
    expect(audienceEvidence?.detail).toMatch(/audience must be one of/);
  });

  it('FAIL: canonicalName !== "Kloel"', () => {
    const payload = validPayload({
      lineage: {
        canonicalName: 'NotKloel',
        genesisEventId: 'ev-genesis-001',
        lineageStatus: 'intact',
        operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
        capabilities: ['lineage'],
      },
    });
    const v = gate().check(payload);
    expect(v.status).toBe('FAIL');
    const nameEvidence = v.evidence?.find((e) => e.path === '$.lineage.canonicalName');
    expect(nameEvidence).toBeDefined();
    expect(nameEvidence?.detail).toMatch(/Kloel/);
  });

  it('FAIL: identityProjection missing from payload', () => {
    const base = validPayload();
    delete base['identityProjection'];
    const v = gate().check(base);
    expect(v.status).toBe('FAIL');
    const missingEvidence = v.evidence?.find((e) => e.path === '$.identityProjection');
    expect(missingEvidence).toBeDefined();
    expect(missingEvidence?.detail).toMatch(/missing/);
  });

  it('FAIL: identityProjection is not an object (string)', () => {
    const payload = validPayload({
      identityProjection: 'not_an_object',
    });
    const v = gate().check(payload);
    expect(v.status).toBe('FAIL');
    const notObjEvidence = v.evidence?.find((e) => e.path === '$.identityProjection');
    expect(notObjEvidence).toBeDefined();
    expect(notObjEvidence?.detail).toMatch(/must be an object/);
  });

  it('FAIL: identityProjection is an array', () => {
    const payload = validPayload({
      identityProjection: [{ audience: 'public' }],
    });
    const v = gate().check(payload);
    expect(v.status).toBe('FAIL');
    const arrEvidence = v.evidence?.find((e) => e.path === '$.identityProjection');
    expect(arrEvidence).toBeDefined();
    expect(arrEvidence?.detail).toMatch(/must be an object/);
  });

  it('FAIL: truthMode inconsistency between lineage and identityProjection', () => {
    const payload = validPayload({
      identityProjection: { audience: 'public', currentMaturity: 'developing', truthMode: 'observed' },
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
    expect(v.status).toBe('FAIL');
    const tmEvidence = v.evidence?.find((e) => e.path === '$.identityProjection.truthMode');
    expect(tmEvidence).toBeDefined();
    expect(tmEvidence?.detail).toMatch(/truthMode mismatch/);
  });

  it('FAIL: invalid truthMode in identityProjection', () => {
    const payload = validPayload({
      identityProjection: { audience: 'public', currentMaturity: 'developing', truthMode: 'magical' },
    });
    const v = gate().check(payload);
    expect(v.status).toBe('FAIL');
    const invalidTmEvidence = v.evidence?.find((e) => e.path === '$.identityProjection.truthMode');
    expect(invalidTmEvidence).toBeDefined();
  });

  it('FAIL: both invalid audience AND canonicalName mismatch (2 issues)', () => {
    const payload = validPayload({
      identityProjection: { audience: 'alien', currentMaturity: 'developing', truthMode: 'observed' },
      lineage: {
        canonicalName: 'Impostor',
        genesisEventId: 'ev-genesis-001',
        lineageStatus: 'intact',
        operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
        capabilities: ['lineage'],
      },
    });
    const v = gate().check(payload);
    expect(v.status).toBe('FAIL');
    expect(v.reason).toMatch(/2 identity-projection issue/);
    const paths = v.evidence?.map((e) => e.path) ?? [];
    expect(paths).toContain('$.identityProjection.audience');
    expect(paths).toContain('$.lineage.canonicalName');
  });

  it('FAIL: public etymology leak + truthMode mismatch (2 issues)', () => {
    const payload = validPayload({
      identityProjection: { audience: 'public', currentMaturity: 'developing', truthMode: 'projected' },
      lineage: {
        canonicalName: 'Kloel',
        genesisEventId: 'ev-genesis-001',
        lineageStatus: 'intact',
        operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
        capabilities: ['lineage'],
        etymology: 'forjado-em-beta',
        truthMode: 'observed',
      },
    });
    const v = gate().check(payload);
    expect(v.status).toBe('FAIL');
    expect(v.reason).toMatch(/2 identity-projection issue/);
    const paths = v.evidence?.map((e) => e.path) ?? [];
    expect(paths).toContain('$.lineage.etymology');
    expect(paths).toContain('$.identityProjection.truthMode');
  });

  it('FAIL: missing identityProjection + invalid canonicalName (2 issues)', () => {
    const base = validPayload({
      lineage: {
        canonicalName: 'FakeKloel',
        genesisEventId: 'ev-genesis-001',
        lineageStatus: 'intact',
        operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
        capabilities: ['lineage'],
      },
    });
    delete base['identityProjection'];
    const v = gate().check(base);
    expect(v.status).toBe('FAIL');
    expect(v.reason).toMatch(/2 identity-projection issue/);
    const paths = v.evidence?.map((e) => e.path) ?? [];
    expect(paths).toContain('$.identityProjection');
    expect(paths).toContain('$.lineage.canonicalName');
  });
});

// ─── edge-case / boundary scenarios ─────────────────────────────────────

describe('identity-projection gate — EDGE', () => {
  it('PASS: public audience, lineage is not an object (no leak detectable)', () => {
    const payload = validPayload({
      lineage: 'not_an_object',
    });
    const v = gate().check(payload);
    expect(v.status).toBe('PASS');
  });

  it('FAIL: payload is null', () => {
    const v = gate().check(null);
    expect(v.status).toBe('FAIL');
    expect(v.evidence?.[0]?.path).toBe('$');
    expect(v.evidence?.[0]?.detail).toMatch(/not an object/);
  });

  it('FAIL: payload is an array', () => {
    const v = gate().check([{ x: 1 }]);
    expect(v.status).toBe('FAIL');
    expect(v.evidence?.[0]?.path).toBe('$');
  });

  it('FAIL: payload is undefined', () => {
    const v = gate().check(undefined);
    expect(v.status).toBe('FAIL');
  });

  it('PASS: technical audience, etymology AND origin present, truthMode present in lineage', () => {
    const payload = validPayload({
      identityProjection: { audience: 'technical', currentMaturity: 'productionReady', truthMode: 'inferred' },
      lineage: {
        canonicalName: 'Kloel',
        genesisEventId: 'ev-genesis-001',
        lineageStatus: 'intact',
        operationalAge: { sinceGenesisDays: 1, sinceFirstWorkspaceDays: 0 },
        capabilities: ['lineage'],
        etymology: 'alpha-branch',
        origin: 'genesis-v0',
        truthMode: 'inferred',
      },
    });
    const v = gate().check(payload);
    expect(v.status).toBe('PASS');
  });
});
