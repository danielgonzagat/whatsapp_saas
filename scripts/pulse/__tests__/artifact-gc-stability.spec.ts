import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import * as path from 'path';
import { ensureDir, pathExists, readDir, removePath, writeTextFile } from '../safe-fs';
import { assertWithinRoot, safeJoin } from '../lib/safe-path';
import { cleanupPulseArtifacts } from '../artifact-gc';
import type { PulseArtifactRegistry } from '../artifact-registry';
import { buildArtifactRegistry } from '../artifact-registry';

/** OS temp directory root used to scope all fs operations in this spec. */
const TEMP_ROOT = path.resolve(os.tmpdir());

describe('Artifact GC Stability', () => {
  let tempDir: string;
  let registry: PulseArtifactRegistry;

  beforeEach(() => {
    tempDir = safeJoin(TEMP_ROOT, `pulse-gc-test-${Date.now()}`);
    ensureDir(tempDir, { recursive: true });
    registry = buildArtifactRegistry(tempDir);
  });

  afterEach(() => {
    const safeTempDir = assertWithinRoot(tempDir, TEMP_ROOT);
    if (pathExists(safeTempDir)) {
      removePath(safeTempDir, { recursive: true, force: true });
    }
  });

  it('should run GC twice and maintain stable artifact count', () => {
    // First run
    cleanupPulseArtifacts(registry);
    const count1 = countArtifactsInCanonical(registry.canonicalDir);

    // Second run
    cleanupPulseArtifacts(registry);
    const count2 = countArtifactsInCanonical(registry.canonicalDir);

    // Counts should be stable (both zero or both same)
    expect(count2).toBe(count1);
  });

  it('should never remove canonical or temp dirs', () => {
    cleanupPulseArtifacts(registry);

    expect(pathExists(registry.canonicalDir)).toBe(true);
    expect(pathExists(registry.tempDir)).toBe(true);
  });

  it('should preserve artifacts in canonical dir across GC runs', () => {
    // Run GC first to ensure structure is created
    cleanupPulseArtifacts(registry);

    // Create a test artifact (simulating PULSE_WORLD_STATE)
    const testArtifactPath = safeJoin(registry.canonicalDir, 'PULSE_WORLD_STATE.json');
    writeTextFile(testArtifactPath, JSON.stringify({ test: true }));

    // Run GC again
    cleanupPulseArtifacts(registry);

    // Artifact should still exist in canonical
    expect(pathExists(testArtifactPath)).toBe(true);
  });

  function countArtifactsInCanonical(dir: string): number {
    const safeDir = assertWithinRoot(dir, TEMP_ROOT);
    if (!pathExists(safeDir)) return 0;
    return readDir(safeDir).length;
  }
});
