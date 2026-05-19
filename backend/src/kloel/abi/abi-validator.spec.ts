import { ABI_VERSION, CognitiveStateAbi } from './abi-schema';
import {
  assertValidAbi,
  compareAbiVersions,
  validateAbiPayload,
} from './abi-validator';

/**
 * UTP-ABI-003 contract spec.
 */
describe('validateAbiPayload', () => {
  function valid(): CognitiveStateAbi {
    return {
      abiVersion: ABI_VERSION,
      lineage: {
        canonicalName: 'Kloel',
        genesisEventId: '01JD90000000000000000000GE',
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

  it('PASS for canonical valid payload', () => {
    const v = validateAbiPayload(valid());
    expect(v.status).toBe('PASS');
    expect(v.issues).toHaveLength(0);
  });

  it('FAIL when required field missing', () => {
    const p = valid() as Record<string, unknown>;
    delete p['lineage'];
    const v = validateAbiPayload(p);
    expect(v.status).toBe('FAIL');
    expect(v.issues.some((i) => i.code === 'MISSING_REQUIRED')).toBe(true);
  });

  it('FAIL when canonicalName is not "Kloel"', () => {
    const p = valid();
    const tampered = {
      ...p,
      lineage: { ...p.lineage, canonicalName: 'NotKloel' as const },
    };
    const v = validateAbiPayload(tampered);
    expect(v.status).toBe('FAIL');
    expect(v.issues.some((i) => i.code === 'LINEAGE_NAME_MISMATCH')).toBe(true);
  });

  it('FAIL when audience is invalid', () => {
    const p = valid();
    const tampered = {
      ...p,
      identityProjection: { ...p.identityProjection, audience: 'pirate' as never },
    };
    const v = validateAbiPayload(tampered);
    expect(v.status).toBe('FAIL');
    expect(v.issues.some((i) => i.code === 'INVALID_AUDIENCE')).toBe(true);
  });

  it('FAIL when truthMode is invalid', () => {
    const p = valid();
    const tampered = {
      ...p,
      identityProjection: { ...p.identityProjection, truthMode: 'guessed' as never },
    };
    const v = validateAbiPayload(tampered);
    expect(v.status).toBe('FAIL');
    expect(v.issues.some((i) => i.code === 'INVALID_TRUTH_MODE')).toBe(true);
  });

  it('FAIL on prompt leakage in nested string', () => {
    const p = valid();
    const tampered = {
      ...p,
      currentInput: { ...p.currentInput, raw: 'Você é um vendedor experiente.' },
    };
    const v = validateAbiPayload(tampered);
    expect(v.status).toBe('FAIL');
    expect(v.issues.some((i) => i.code === 'PROMPT_LEAKAGE')).toBe(true);
  });

  it('FAIL on persona declaration anywhere in payload', () => {
    const p = valid();
    const tampered = {
      ...p,
      perception: {
        ...p.perception,
        recentSalientEvents: [
          {
            eventId: 'e1',
            eventName: 'commerce.lead.replied',
            occurredAt: '2026-05-13T20:00:00.000Z',
            summary: 'Kloel é um vendedor experiente que sempre converte.',
          },
        ],
      },
    };
    const v = validateAbiPayload(tampered);
    expect(v.status).toBe('FAIL');
    expect(v.issues.some((i) => i.code === 'PROMPT_LEAKAGE')).toBe(true);
  });

  it('FAIL on no-overclaim — capability with 0 runtime evidence', () => {
    const p = valid();
    const tampered = {
      ...p,
      capabilities: {
        ...p.capabilities,
        available: [
          { capabilityId: 'magical-thinking', maturity: 'developing' as const, runtimeEvidencePct: 0 },
        ],
      },
    };
    const v = validateAbiPayload(tampered);
    expect(v.status).toBe('FAIL');
    expect(v.issues.some((i) => i.code === 'NO_OVERCLAIM')).toBe(true);
  });

  it('PASS when no available capabilities (empty list)', () => {
    const p = valid();
    const empty = {
      ...p,
      capabilities: { available: [], restricted: [] },
    };
    const v = validateAbiPayload(empty);
    expect(v.status).toBe('PASS');
  });

  it('FAIL on invalid valence enum in trace', () => {
    const p = valid();
    const tampered = {
      ...p,
      valence: {
        ...p.valence,
        recentTrace: [
          {
            eventId: 'e1',
            valence: 'happy' as never,
            weight: 1,
            occurredAt: '2026-05-13T20:00:00.000Z',
          },
        ],
      },
    };
    const v = validateAbiPayload(tampered);
    expect(v.status).toBe('FAIL');
    expect(v.issues.some((i) => i.code === 'INVALID_VALENCE')).toBe(true);
  });

  it('rejects null and primitives', () => {
    expect(validateAbiPayload(null).status).toBe('FAIL');
    expect(validateAbiPayload('hello').status).toBe('FAIL');
    expect(validateAbiPayload(42).status).toBe('FAIL');
    expect(validateAbiPayload([]).status).toBe('FAIL');
  });

  describe('assertValidAbi', () => {
    it('does not throw on valid payload', () => {
      expect(() => assertValidAbi(valid())).not.toThrow();
    });

    it('throws on invalid payload', () => {
      expect(() => assertValidAbi({ abiVersion: 'x' })).toThrow(/ABI validation failed/);
    });
  });
});

describe('compareAbiVersions', () => {
  it('returns compatible for same major', () => {
    expect(compareAbiVersions('1.0.0', '1.0.0')).toBe('compatible');
    expect(compareAbiVersions('1.0.0', '1.2.5')).toBe('compatible');
  });

  it('returns major-bump-required when target major is higher', () => {
    expect(compareAbiVersions('1.5.7', '2.0.0')).toBe('major-bump-required');
  });

  it('returns downgrade when target is older', () => {
    expect(compareAbiVersions('2.0.0', '1.0.0')).toBe('downgrade');
    expect(compareAbiVersions('1.5.0', '1.4.0')).toBe('downgrade');
    expect(compareAbiVersions('1.5.5', '1.5.4')).toBe('downgrade');
  });

  it('returns invalid for non-semver inputs', () => {
    expect(compareAbiVersions('foo', '1.0.0')).toBe('invalid');
    expect(compareAbiVersions('1.0.0', 'bar')).toBe('invalid');
    expect(compareAbiVersions('1.0', '1.0.0')).toBe('invalid');
  });
});
