import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildRuntimeProbesArtifact, normalizeRuntimeProbesArtifact } from '../runtime-probes';
import { proveCapability } from '../production-proof';
import type { PulseRuntimeEvidence, PulseRuntimeProbe } from '../types';
import type { PulseRuntimeProbesArtifact } from '../types.runtime-probes';

const generatedAt = '2026-04-29T18:00:00.000Z';

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'pulse-runtime-probes-'));
  mkdirSync(join(root, '.pulse', 'current'), { recursive: true });
  roots.push(root);
  return root;
}

function writePulseArtifact(root: string, fileName: string, value: unknown): void {
  writeFileSync(join(root, '.pulse', 'current', fileName), JSON.stringify(value, null, 2));
}

function expectArtifact(value: PulseRuntimeProbesArtifact | null): PulseRuntimeProbesArtifact {
  if (!value) {
    throw new Error('Expected runtime probes artifact to normalize.');
  }
  return value;
}

function makeProbe(overrides: Partial<PulseRuntimeProbe> = {}): PulseRuntimeProbe {
  return {
    probeId: 'backend-health',
    target: 'https://api.example.test/health/system',
    required: true,
    executed: true,
    status: 'passed',
    summary: 'Backend health passed.',
    artifactPaths: ['PULSE_RUNTIME_EVIDENCE.json', 'PULSE_RUNTIME_PROBES.json'],
    ...overrides,
  };
}

function makeEvidence(probes: PulseRuntimeProbe[]): PulseRuntimeEvidence {
  return {
    executed: probes.some((probe) => probe.executed),
    executedChecks: probes.filter((probe) => probe.executed).map((probe) => probe.probeId),
    blockingBreakTypes: [],
    artifactPaths: ['PULSE_RUNTIME_EVIDENCE.json', 'PULSE_RUNTIME_PROBES.json'],
    summary: 'Runtime probes executed successfully.',
    probes,
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('runtime probes artifact', () => {
  it('builds a self-describing live artifact with proof-eligible probes', () => {
    const artifact = buildRuntimeProbesArtifact(makeEvidence([makeProbe()]), {
      generatedAt,
      environment: 'total',
    });

    expect(artifact.artifact).toBe('PULSE_RUNTIME_PROBES');
    expect(artifact.executed).toBe(true);
    expect(artifact.source).toBe('live');
    expect(artifact.status).toBe('passed');
    expect(artifact.freshness.fresh).toBe(true);
    expect(artifact.probes).toHaveLength(1);
    expect(artifact.probes[0].proofEligible).toBe(true);
    expect(artifact.probes[0].source).toBe('live');
    expect(artifact.totals.proofEligible).toBe(1);
  });

  it('does not convert not-run, skipped, or simulated probes into passing proof', () => {
    const artifact = expectArtifact(
      normalizeRuntimeProbesArtifact(
        {
          generatedAt,
          source: 'live',
          executed: true,
          probes: [
            {
              probeId: 'not-run-health',
              target: 'https://api.example.test/health/system',
              required: true,
              executed: false,
              status: 'passed',
              summary: 'Invalid legacy status.',
              artifactPaths: [],
            },
            {
              probeId: 'skipped-auth',
              target: 'https://api.example.test/auth/login',
              required: true,
              executed: false,
              status: 'skipped',
              summary: 'Skipped in scan mode.',
              artifactPaths: [],
            },
            {
              probeId: 'simulated-db',
              target: 'database',
              required: true,
              executed: true,
              status: 'passed',
              source: 'simulated',
              summary: 'Simulated probe should not prove production.',
              artifactPaths: [],
            },
          ],
        },
        { generatedAt },
      ),
    );

    expect(artifact.probes.map((probe) => probe.status)).toEqual([
      'not_run',
      'skipped',
      'simulated',
    ]);
    expect(artifact.probes.every((probe) => !probe.proofEligible)).toBe(true);
    expect(artifact.status).not.toBe('passed');
    expect(artifact.totals.proofEligible).toBe(0);
  });

  it('allows production-proof to consume the new probes envelope', () => {
    const root = makeRoot();
    const artifact = buildRuntimeProbesArtifact(
      makeEvidence([
        makeProbe({ probeId: 'backend-health' }),
        makeProbe({
          probeId: 'frontend-reachability',
          target: 'https://app.example.test',
          required: true,
          summary: 'Frontend reached.',
        }),
        makeProbe({
          probeId: 'db-connectivity',
          target: 'database',
          required: true,
          summary: 'Database reached.',
        }),
      ]),
      { generatedAt, environment: 'total' },
    );
    writePulseArtifact(root, 'PULSE_RUNTIME_PROBES.json', artifact);

    const proof = proveCapability('runtime-capability', root);

    expect(proof.deployStatus).toBe('proven');
    expect(proof.healthCheck).toBe('proven');
    expect(proof.runtimeProbe).toBe('proven');
    expect(proof.dbSideEffects).toBe('proven');
  });

  it('keeps simulated probes unproven in production-proof', () => {
    const root = makeRoot();
    const artifact = expectArtifact(
      normalizeRuntimeProbesArtifact(
        {
          generatedAt,
          source: 'simulated',
          executed: true,
          probes: [
            {
              probeId: 'backend-health',
              target: 'https://api.example.test/health/system',
              required: true,
              executed: true,
              status: 'passed',
              source: 'simulated',
              summary: 'Synthetic health probe.',
              artifactPaths: [],
            },
            {
              probeId: 'db-connectivity',
              target: 'database',
              required: true,
              executed: true,
              status: 'passed',
              source: 'simulated',
              summary: 'Synthetic database probe.',
              artifactPaths: [],
            },
          ],
        },
        { generatedAt },
      ),
    );
    writePulseArtifact(root, 'PULSE_RUNTIME_PROBES.json', artifact);

    const proof = proveCapability('runtime-capability', root);

    expect(proof.deployStatus).toBe('unproven');
    expect(proof.healthCheck).toBe('unproven');
    expect(proof.runtimeProbe).toBe('unproven');
    expect(proof.dbSideEffects).toBe('unproven');
  });
});
