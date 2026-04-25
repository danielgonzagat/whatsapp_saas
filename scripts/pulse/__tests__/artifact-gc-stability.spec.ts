import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { cleanupPulseArtifacts } from '../artifact-gc';
import type { PulseArtifactRegistry } from '../artifact-registry';
import { buildArtifactRegistry } from '../artifact-registry';

/** OS temp directory root used to scope all fs operations in this spec. */
const TEMP_ROOT = path.resolve('/tmp');

/**
 * Resolves `p` and asserts it lives inside the OS temp root. Guards the spec's
 * fs probes against accidental traversal even when the path is constructed
 * locally.
 */
function assertInsideTempRoot(p: string): string {
  const resolved = path.resolve(p);
  if (resolved !== TEMP_ROOT && !resolved.startsWith(TEMP_ROOT + path.sep)) {
    throw new Error(`Path "${p}" resolves outside temp root "${TEMP_ROOT}"`);
  }
  return resolved;
}

describe('Artifact GC Stability', () => {
  let tempDir: string;
  let registry: PulseArtifactRegistry;

  beforeEach(() => {
    tempDir = path.join('/tmp', `pulse-gc-test-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });
    registry = buildArtifactRegistry(tempDir);
  });

  afterEach(() => {
    const safeTempDir = assertInsideTempRoot(tempDir);
    if (fs.existsSync(safeTempDir)) {
      fs.rmSync(safeTempDir, { recursive: true, force: true });
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
    const safeDir = assertInsideTempRoot(dir);
    if (!fs.existsSync(safeDir)) return 0;
    return fs.readdirSync(safeDir).length;
  }
});
