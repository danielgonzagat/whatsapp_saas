/**
 * Unit tests for PULSE cross-artifact consistency check.
 *
 * Tests use in-memory artifact objects rather than touching the filesystem,
 * exercising checkConsistency() directly.
 */

import { describe, it, expect } from 'vitest';
import {
  checkConsistency,
  loadArtifact,
  type ArtifactDivergence,
  type ConsistencyResult,
} from '../cross-artifact-consistency-check';
import { checkCrossArtifactConsistency } from '../self-trust';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeArtifact(
  filePath: string,
  data: Record<string, unknown>,
): { filePath: string; data: Record<string, unknown> } {
  return { filePath, data };
}

/** Shared "good" base values so every test starts from a consistent baseline. */
const GOOD_CERT = makeArtifact('PULSE_CERTIFICATE.json', {
  status: 'PARTIAL',
  humanReplacementStatus: 'NOT_READY',
  score: 65,
  blockingTier: 1,
  timestamp: '2026-04-25T03:15:42.931Z',
});

const GOOD_CLI = makeArtifact('PULSE_CLI_DIRECTIVE.json', {
  authorityMode: 'autonomous-execution',
  advisoryOnly: false,
  automationEligible: true,
  productionAutonomyVerdict: 'NAO',
  zeroPromptProductionGuidanceVerdict: 'SIM',
  generatedAt: '2026-04-25T03:15:42.931Z',
});

const GOOD_INDEX = makeArtifact('PULSE_ARTIFACT_INDEX.json', {
  authorityMode: 'autonomous-execution',
  advisoryOnly: false,
  generatedAt: '2026-04-25T03:15:42.931Z',
});

const GOOD_PROOF = makeArtifact('.pulse/current/PULSE_AUTONOMY_PROOF.json', {
  authorityMode: 'autonomous-execution',
  advisoryOnly: false,
  automationEligible: true,
  generatedAt: '2026-04-25T03:15:42.931Z',
  productionAutonomyAnswer: 'NAO',
  zeroPromptProductionGuidanceAnswer: 'SIM',
  verdicts: {
    productionAutonomy: 'NAO',
    zeroPromptProductionGuidance: 'SIM',
    canDeclareComplete: false,
  },
  cycleProof: {
    proven: false,
  },
});

const GOOD_CONVERGENCE = makeArtifact('.pulse/current/PULSE_CONVERGENCE_PLAN.json', {
  status: 'PARTIAL',
  humanReplacementStatus: 'NOT_READY',
  blockingTier: 1,
  generatedAt: '2026-04-25T03:15:42.931Z',
});

// ---------------------------------------------------------------------------
// Happy path: all artifacts consistent
// ---------------------------------------------------------------------------

describe('checkConsistency – happy path', () => {
  it('passes when all artifacts agree on shared fields', () => {
    const result: ConsistencyResult = checkConsistency([
      GOOD_CERT,
      GOOD_CLI,
      GOOD_INDEX,
      GOOD_PROOF,
      GOOD_CONVERGENCE,
    ]);
    expect(result.pass).toBe(true);
    expect(result.divergences).toHaveLength(0);
  });

  it('passes when no artifact has a particular field (nothing to compare)', () => {
    const a = makeArtifact('a.json', { generatedAt: '2026-04-25T03:15:42.931Z' });
    const b = makeArtifact('b.json', { generatedAt: '2026-04-25T03:15:42.931Z' });
    const result = checkConsistency([a, b]);
    expect(result.pass).toBe(true);
  });

  it('passes with empty artifact list', () => {
    const result = checkConsistency([]);
    expect(result.pass).toBe(true);
    expect(result.divergences).toHaveLength(0);
  });

  it('allows generatedAt drift within 5-minute window', () => {
    const base = new Date('2026-04-25T03:15:00.000Z');
    const within = new Date(base.getTime() + 4 * 60 * 1000); // +4 minutes
    const a = makeArtifact('a.json', { generatedAt: base.toISOString() });
    const b = makeArtifact('b.json', { generatedAt: within.toISOString() });
    const result = checkConsistency([a, b]);
    const driftDiv = result.divergences.find((d) => d.field === 'generatedAt');
    expect(driftDiv).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Status divergence
// Only PULSE_CERTIFICATE.json and .pulse/current/PULSE_CONVERGENCE_PLAN.json
// share the certification-domain status semantic.
// ---------------------------------------------------------------------------

describe('checkConsistency – status divergence', () => {
  it('reports divergence when certification-domain status values differ', () => {
    // Use cert-domain artifact paths so the scoped check fires
    const a = makeArtifact('PULSE_CERTIFICATE.json', { status: 'PARTIAL' });
    const b = makeArtifact('.pulse/current/PULSE_CONVERGENCE_PLAN.json', { status: 'CERTIFIED' });
    const result = checkConsistency([a, b]);
    expect(result.pass).toBe(false);
    const div: ArtifactDivergence | undefined = result.divergences.find(
      (d) => d.field === 'status',
    );
    expect(div).toBeDefined();
    expect(div!.values['PULSE_CERTIFICATE.json']).toBe('PARTIAL');
    expect(div!.values['.pulse/current/PULSE_CONVERGENCE_PLAN.json']).toBe('CERTIFIED');
    expect(div!.sources).toContain('PULSE_CERTIFICATE.json');
    expect(div!.sources).toContain('.pulse/current/PULSE_CONVERGENCE_PLAN.json');
  });

  it('does NOT report divergence when autonomy-state status is "idle" alongside cert status', () => {
    // PULSE_AUTONOMY_STATE.json uses status for orchestration lifecycle, not certification
    const cert = makeArtifact('PULSE_CERTIFICATE.json', { status: 'PARTIAL' });
    const autonomy = makeArtifact('.pulse/current/PULSE_AUTONOMY_STATE.json', { status: 'idle' });
    const orch = makeArtifact('.pulse/current/PULSE_AGENT_ORCHESTRATION_STATE.json', {
      status: 'idle',
    });
    const result = checkConsistency([cert, autonomy, orch]);
    const div = result.divergences.find((d) => d.field === 'status');
    expect(div).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// authorityMode divergence
// ---------------------------------------------------------------------------

describe('checkConsistency – authorityMode divergence', () => {
  it('reports divergence when authorityMode values differ', () => {
    const a = makeArtifact('PULSE_CLI_DIRECTIVE.json', {
      authorityMode: 'autonomous-execution',
      generatedAt: '2026-04-25T03:15:42.931Z',
    });
    const b = makeArtifact('PULSE_ARTIFACT_INDEX.json', {
      authorityMode: 'advisory-only',
      generatedAt: '2026-04-25T03:15:42.931Z',
    });
    const c = makeArtifact('.pulse/current/PULSE_AUTONOMY_PROOF.json', {
      authorityMode: 'autonomous-execution',
      generatedAt: '2026-04-25T03:15:42.931Z',
    });
    const result = checkConsistency([a, b, c]);
    expect(result.pass).toBe(false);
    const div = result.divergences.find((d) => d.field === 'authorityMode');
    expect(div).toBeDefined();
    expect(div!.values['PULSE_ARTIFACT_INDEX.json']).toBe('advisory-only');
    expect(div!.values['PULSE_CLI_DIRECTIVE.json']).toBe('autonomous-execution');
  });
});

// ---------------------------------------------------------------------------
// cycleProof contradiction
// ---------------------------------------------------------------------------

describe('checkConsistency – cycleProof.proven contradiction', () => {
  it('reports divergence when cycleProof.proven differs between artifacts', () => {
    const a = makeArtifact('a.json', {
      cycleProof: { proven: true },
    });
    const b = makeArtifact('b.json', {
      cycleProof: { proven: false },
    });
    const result = checkConsistency([a, b]);
    expect(result.pass).toBe(false);
    const div = result.divergences.find((d) => d.field === 'cycleProof.proven');
    expect(div).toBeDefined();
    expect(div!.values['a.json']).toBe(true);
    expect(div!.values['b.json']).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generatedAt excessive drift
// ---------------------------------------------------------------------------

describe('checkConsistency – generatedAt drift', () => {
  it('reports divergence when drift exceeds 5 minutes', () => {
    const base = new Date('2026-04-25T03:00:00.000Z');
    const far = new Date(base.getTime() + 10 * 60 * 1000); // +10 minutes
    const a = makeArtifact('a.json', { generatedAt: base.toISOString() });
    const b = makeArtifact('b.json', { generatedAt: far.toISOString() });
    const result = checkConsistency([a, b]);
    expect(result.pass).toBe(false);
    const div = result.divergences.find((d) => d.field === 'generatedAt');
    expect(div).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Missing artifact graceful handling
// ---------------------------------------------------------------------------

describe('loadArtifact – missing artifact graceful handling', () => {
  it('returns null when the file does not exist', () => {
    const nonExistent = path.join(os.tmpdir(), `nonexistent_${Date.now()}.json`);
    const result = loadArtifact(nonExistent);
    expect(result).toBeNull();
  });

  it('throws with informative message for invalid JSON', () => {
    const tmpFile = path.join(os.tmpdir(), `invalid_json_${Date.now()}.json`);
    fs.writeFileSync(tmpFile, '{ not valid json }');
    expect(() => loadArtifact(tmpFile)).toThrow(/not valid JSON/i);
    fs.unlinkSync(tmpFile);
  });

  it('returns the parsed object for a valid JSON artifact', () => {
    const tmpFile = path.join(os.tmpdir(), `valid_json_${Date.now()}.json`);
    const payload = { status: 'PARTIAL', score: 65 };
    fs.writeFileSync(tmpFile, JSON.stringify(payload));
    const result = loadArtifact(tmpFile);
    expect(result).toEqual(payload);
    fs.unlinkSync(tmpFile);
  });
});

// ---------------------------------------------------------------------------
// checkConsistency – productionAutonomyVerdict cross-alias
// ---------------------------------------------------------------------------

describe('checkConsistency – productionAutonomyVerdict aliases', () => {
  it('detects divergence between CLI_DIRECTIVE root field and PROOF verdicts alias', () => {
    const cli = makeArtifact('PULSE_CLI_DIRECTIVE.json', {
      productionAutonomyVerdict: 'SIM',
      generatedAt: '2026-04-25T03:15:42.931Z',
    });
    const proof = makeArtifact('.pulse/current/PULSE_AUTONOMY_PROOF.json', {
      verdicts: { productionAutonomy: 'NAO', canDeclareComplete: false },
      generatedAt: '2026-04-25T03:15:42.931Z',
    });
    const result = checkConsistency([cli, proof]);
    expect(result.pass).toBe(false);
    const div = result.divergences.find((d) => d.field === 'productionAutonomyVerdict');
    expect(div).toBeDefined();
  });

  it('passes when CLI and PROOF agree on productionAutonomyVerdict', () => {
    const cli = makeArtifact('PULSE_CLI_DIRECTIVE.json', {
      productionAutonomyVerdict: 'NAO',
      generatedAt: '2026-04-25T03:15:42.931Z',
    });
    const proof = makeArtifact('.pulse/current/PULSE_AUTONOMY_PROOF.json', {
      verdicts: { productionAutonomy: 'NAO', canDeclareComplete: false },
      generatedAt: '2026-04-25T03:15:42.931Z',
    });
    const result = checkConsistency([cli, proof]);
    const div = result.divergences.find((d) => d.field === 'productionAutonomyVerdict');
    expect(div).toBeUndefined();
  });
});

describe('checkConsistency – final production proof coherence', () => {
  it('detects divergence between directive readiness and autonomy proof completion', () => {
    const cli = makeArtifact('PULSE_CLI_DIRECTIVE.json', {
      productionAutonomyVerdict: 'SIM',
      autonomyReadiness: { canDeclareComplete: true },
      generatedAt: '2026-04-25T03:15:42.931Z',
    });
    const proof = makeArtifact('.pulse/current/PULSE_AUTONOMY_PROOF.json', {
      verdicts: { productionAutonomy: 'NAO', canDeclareComplete: false },
      generatedAt: '2026-04-25T03:15:42.931Z',
    });

    const result = checkConsistency([cli, proof]);

    expect(result.pass).toBe(false);
    expect(result.divergences.some((d) => d.field === 'finalProduction.canDeclareComplete')).toBe(
      true,
    );
  });

  it('fails a completion claim when proof-readiness still has unobserved critical paths', () => {
    const cli = makeArtifact('PULSE_CLI_DIRECTIVE.json', {
      productionAutonomyVerdict: 'SIM',
      autonomyReadiness: { canDeclareComplete: true },
      generatedAt: '2026-04-25T03:15:42.931Z',
    });
    const proofReadiness = makeArtifact('.pulse/current/PULSE_PROOF_READINESS.json', {
      status: 'READY',
      summary: {
        criticalUnobservedPaths: 3,
        observedPass: 12,
      },
      generatedAt: '2026-04-25T03:15:42.931Z',
    });

    const result = checkConsistency([cli, proofReadiness]);

    expect(result.pass).toBe(false);
    const div = result.divergences.find((d) => d.field === 'finalProduction.observedProof');
    expect(div).toBeDefined();
    expect(
      div!.values['.pulse/current/PULSE_PROOF_READINESS.json#summary.criticalUnobservedPaths'],
    ).toBe(3);
  });
});

describe('checkCrossArtifactConsistency – self-trust integration', () => {
  it('returns a failing checkpoint when overridden artifacts claim complete without observed proof', () => {
    const checkpoint = checkCrossArtifactConsistency(undefined, {
      'PULSE_CLI_DIRECTIVE.json': {
        productionAutonomyVerdict: 'SIM',
        autonomyReadiness: { canDeclareComplete: true },
        generatedAt: '2026-04-25T03:15:42.931Z',
      },
      '.pulse/current/PULSE_PROOF_READINESS.json': {
        status: 'READY',
        summary: { criticalUnobservedPaths: 1 },
        generatedAt: '2026-04-25T03:15:42.931Z',
      },
    });

    expect(checkpoint.pass).toBe(false);
    expect(checkpoint.reason).toContain('finalProduction.observedProof');
  });
});
