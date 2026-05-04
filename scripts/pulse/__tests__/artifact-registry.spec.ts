import { describe, expect, it } from 'vitest';
import {
  buildArtifactRegistry,
  resolveArtifactRelativePath,
  requireArtifactDefinitionById,
} from '../artifact-registry';
import { buildArtifactIndex } from '../artifacts.directive';
import type { PulseArtifactCleanupReport } from '../artifact-gc';
import type { AuthorityState } from '../artifacts.autonomy';

function requireRecord(value: unknown): Record<string, unknown> {
  expect(value).toBeTruthy();
  expect(typeof value).toBe('object');
  return value as Record<string, unknown>;
}

function requireRecordArray(value: unknown): Record<string, unknown>[] {
  expect(Array.isArray(value)).toBe(true);
  return value as Record<string, unknown>[];
}

function requireArray(value: unknown): unknown[] {
  expect(Array.isArray(value)).toBe(true);
  return value as unknown[];
}

describe('PULSE artifact registry protocol metadata', () => {
  it('keeps compatibility filenames while deriving truth from registered metadata', () => {
    const registry = buildArtifactRegistry('/tmp/pulse-registry-test');
    const worldState = requireArtifactDefinitionById(registry, 'world-state');
    const runtimeEvidence = requireArtifactDefinitionById(registry, 'runtime-evidence');

    expect(resolveArtifactRelativePath(registry, 'world-state')).toBe('PULSE_WORLD_STATE.json');
    expect(worldState.mirrorToRoot).toBe(true);
    expect(worldState.schema).toEqual(
      expect.objectContaining({
        module: './types',
        exportName: 'PulseCertification.evidenceSummary.worldState',
      }),
    );
    expect(worldState.producer).toEqual(
      expect.objectContaining({
        module: './artifacts',
        exportName: 'snapshot.certification.evidenceSummary.worldState',
      }),
    );
    expect(runtimeEvidence.truthMode).toBe('preserved_evidence');
    expect(runtimeEvidence.freshness.mode).toBe('preserved');
  });

  it('requires every registered artifact to declare schema, producer, freshness, and truth mode', () => {
    const registry = buildArtifactRegistry('/tmp/pulse-registry-test');
    const paths = new Set<string>();

    for (const artifact of registry.artifacts) {
      expect(artifact.relativePath).toMatch(/^PULSE_[A-Z0-9_]+\.(json|jsonl|md)$/);
      expect(paths.has(artifact.relativePath)).toBe(false);
      paths.add(artifact.relativePath);
      expect(artifact.schema.module).toMatch(/^\.\/[a-z0-9./-]+$/);
      expect(artifact.schema.exportName.length).toBeGreaterThan(0);
      expect(artifact.producer.module).toMatch(/^\.\/[a-z0-9./-]+$/);
      expect(artifact.producer.exportName.length).toBeGreaterThan(0);
      expect(artifact.freshness.mode).toMatch(/^(run|preserved|external_snapshot)$/);
      expect(artifact.truthMode).toMatch(
        /^(generated_from_module|preserved_evidence|external_snapshot|compatibility_mirror)$/,
      );
    }
  });

  it('exposes registry authority metadata in the artifact index alongside compat filenames', () => {
    const registry = buildArtifactRegistry('/tmp/pulse-registry-test');
    const registeredWorldState = requireArtifactDefinitionById(registry, 'world-state');
    const cleanupReport: PulseArtifactCleanupReport = {
      generatedAt: '2026-04-29T00:00:00.000Z',
      removedLegacyPulseArtifacts: [],
      removedStaleRootArtifacts: [],
      removedTempArtifacts: [],
      canonicalDir: registry.canonicalDir,
      mirrors: registry.mirrors,
      cleanupMode: 'enforced-single-state',
    };
    const authority: AuthorityState = {
      mode: 'autonomous-execution',
      advisoryOnly: false,
      automationEligible: true,
      reasons: ['test authority'],
    };

    const payload = requireRecord(
      JSON.parse(buildArtifactIndex(registry, cleanupReport, authority)),
    );
    const officialArtifacts = requireRecordArray(payload.officialArtifactMetadata);
    const worldState = requireRecord(
      officialArtifacts.find((artifact) => artifact.id === 'world-state'),
    );
    const worldStateConsumers = requireArray(worldState.consumers);

    expect(payload.officialArtifacts).toContain(registeredWorldState.relativePath);
    expect(worldState.relativePath).toBe(registeredWorldState.relativePath);
    expect(requireRecord(worldState.schema)).toEqual(registeredWorldState.schema);
    expect(requireRecord(worldState.producer)).toEqual(registeredWorldState.producer);
    expect(worldStateConsumers).toEqual(registeredWorldState.consumers);
    expect(worldStateConsumers.length).toBeGreaterThan(0);
    for (const consumer of worldStateConsumers) {
      expect(consumer).toEqual(expect.stringMatching(/^\.\/[a-z0-9./-]+$/));
    }
    expect(requireRecord(worldState.freshness)).toEqual(registeredWorldState.freshness);
    expect(worldState.truthMode).toBe(registeredWorldState.truthMode);
  });
});
