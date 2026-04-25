import { describe, it, expect } from 'vitest';
import { auditManifestRegistry } from '../manifest-audit';

describe('manifest-audit', () => {
  it('should verify pulse.manifest.json, artifact-registry, and artifacts.ts coherence', () => {
    const rootDir = process.cwd();
    const result = auditManifestRegistry(rootDir);

    expect(result.status).toBe('OK');
    expect(result.errors).toHaveLength(0);
    expect(result.orphans.artifacts).toHaveLength(0);
    expect(result.orphans.adapters).toHaveLength(0);
  });
});
