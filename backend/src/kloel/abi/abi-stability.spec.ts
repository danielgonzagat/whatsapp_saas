import {
  ABI_REQUIRED_KEYS,
  ABI_VERSION,
  CognitiveStateAbi,
} from './abi-schema';
import { compareAbiVersions, validateAbiPayload } from './abi-validator';

/**
 * UTP-ABI-004 — Contract stability spec.
 *
 * Implements PCI.2 §7 (docs/contracts/pci/02-abi-schema.md).
 *
 * Goal: prove that ABIs from previous compatible versions still validate
 * against the current schema. Major bumps are intentional; minor/patch
 * changes MUST never break existing consumers.
 *
 * Strategy:
 *   - Pin a baseline payload representative of v1.0.0.
 *   - Validate it under current schema → must PASS.
 *   - Check that comparison reports `compatible` for same-major versions.
 *   - Spot-check that adding a future field is forward-compatible:
 *     baseline still validates after additive synthetic field on a copy.
 */

const v1_0_0_baseline: CognitiveStateAbi = Object.freeze({
  abiVersion: '1.0.0',
  lineage: {
    canonicalName: 'Kloel',
    genesisEventId: '01JD90000000000000000000GE',
    lineageStatus: 'intact',
    operationalAge: { sinceGenesisDays: 0, sinceFirstWorkspaceDays: 0 },
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
});

describe('ABI stability — v1.0.0 baseline against current schema', () => {
  it('current ABI_VERSION is at least 1.0.0', () => {
    expect(compareAbiVersions('1.0.0', ABI_VERSION)).not.toBe('downgrade');
  });

  it('v1.0.0 baseline validates against current schema (forward compatible)', () => {
    const v = validateAbiPayload(v1_0_0_baseline);
    expect(v.status).toBe('PASS');
    expect(v.issues).toHaveLength(0);
  });

  it('declares all required keys', () => {
    for (const key of ABI_REQUIRED_KEYS) {
      expect(v1_0_0_baseline).toHaveProperty(key);
    }
  });

  it('survives addition of an unknown optional field (additive minor bump)', () => {
    const augmented = {
      ...v1_0_0_baseline,
      // Hypothetical future minor-bump field.
      futureExperimentalSection: { something: 'extra' },
    };
    const v = validateAbiPayload(augmented);
    expect(v.status).toBe('PASS');
  });

  it('survives addition of an optional inner field', () => {
    const augmented = {
      ...v1_0_0_baseline,
      lineage: {
        ...v1_0_0_baseline.lineage,
        // Extra unrecognized field — additive, not a contract break.
        extraSubFieldThatFutureBuilderMightAdd: 'yes',
      },
    };
    const v = validateAbiPayload(augmented);
    expect(v.status).toBe('PASS');
  });

  it('FAIL when a required key is removed (contract break)', () => {
    const broken = { ...v1_0_0_baseline } as Record<string, unknown>;
    delete broken['perception'];
    const v = validateAbiPayload(broken);
    expect(v.status).toBe('FAIL');
    expect(v.issues.some((i) => i.code === 'MISSING_REQUIRED')).toBe(true);
  });

  it('rejects payload that downgrades canonicalName (identity break)', () => {
    const broken: CognitiveStateAbi = {
      ...v1_0_0_baseline,
      lineage: {
        ...v1_0_0_baseline.lineage,
        canonicalName: 'Kloel2' as never,
      },
    };
    const v = validateAbiPayload(broken);
    expect(v.status).toBe('FAIL');
    expect(v.issues.some((i) => i.code === 'LINEAGE_NAME_MISMATCH')).toBe(true);
  });
});
