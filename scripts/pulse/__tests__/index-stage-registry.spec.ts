import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

const indexSource = (): string =>
  readFileSync(join(process.cwd(), 'scripts/pulse/index.ts'), 'utf8');

describe('PULSE index stage registry', () => {
  it('registers entrypoint stages with dependency and objective metadata', () => {
    const source = indexSource();

    expect(source).toContain('const PULSE_INDEX_STAGE_DESCRIPTORS');
    expect(source).toContain('objective:');
    expect(source).toContain('dependencies:');
    expect(source).toContain('Registered stages/dependencies/objective');
    expect(source).toContain("id: 'full-scan'");
    expect(source).toContain("id: 'self-trust-verification'");
    expect(source).toContain("id: 'external-sources-orchestration'");
  });

  it('routes traced phases through registered stage metadata', () => {
    const source = indexSource();

    expect(source).toContain('function runRegisteredStage');
    expect(source).toContain('metadata: buildStageMetadata(stageId, options.metadata)');
    expect(source).toContain("runRegisteredStage(\n    tracer,\n    'full-scan'");
    expect(source).toContain("runRegisteredStage(\n    tracer,\n    'declared-flows'");
    expect(source).toContain("runRegisteredStage(\n    tracer,\n    'final-certification'");
  });

  it('derives self-trust artifact overrides from registered descriptors', () => {
    const source = indexSource();

    expect(source).toContain('artifactOverrides:');
    expect(source).toContain("source: 'externalSignalState'");
    expect(source).toContain('function buildRegisteredArtifactOverrides');
    expect(source).toContain("stageId: 'self-trust-verification'");
    expect(source).not.toContain(
      'const artifactsOverride: Record<string, Record<string, unknown>> = {',
    );
  });
});
