import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { cleanupPulseArtifacts } from '../artifact-gc';
import type { PulseArtifactRegistry } from '../artifact-registry';
import { buildArtifactRegistry } from '../artifact-registry';

describe('Artifact GC Stability', () => {
  let tempDir: string;
  let registry: PulseArtifactRegistry;

  beforeEach(() => {
    tempDir = path.join('/tmp', `pulse-gc-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    registry = buildArtifactRegistry(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should run GC twice and maintain stable artifact count', () => {
    // First run
    const report1 = cleanupPulseArtifacts(registry);
    const count1 = countArtifactsInCanonical(registry.canonicalDir);

    // Second run
    const report2 = cleanupPulseArtifacts(registry);
    const count2 = countArtifactsInCanonical(registry.canonicalDir);

    // Counts should be stable (both zero or both same)
    expect(count2).toBe(count1);
  });

  it('should never remove canonical or temp dirs', () => {
    cleanupPulseArtifacts(registry);

    expect(fs.existsSync(registry.canonicalDir)).toBe(true);
    expect(fs.existsSync(registry.tempDir)).toBe(true);
  });

  it('should preserve artifacts in canonical dir across GC runs', () => {
    // Run GC first to ensure structure is created
    cleanupPulseArtifacts(registry);

    // Create a test artifact (simulating PULSE_WORLD_STATE)
    const testArtifactPath = path.join(registry.canonicalDir, 'PULSE_WORLD_STATE.json');
    fs.writeFileSync(testArtifactPath, JSON.stringify({ test: true }), 'utf8');

    // Run GC again
    cleanupPulseArtifacts(registry);

    // Artifact should still exist in canonical
    expect(fs.existsSync(testArtifactPath)).toBe(true);
  });

  function countArtifactsInCanonical(dir: string): number {
    if (!fs.existsSync(dir)) return 0;
    return fs.readdirSync(dir).length;
  }
});
