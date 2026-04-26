import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildArtifactRegistry } from '../../../scripts/pulse/artifact-registry';
import { cleanupPulseArtifacts } from '../../../scripts/pulse/artifact-gc';

function safeFixturePath(filePath: string): string {
  const resolved = path.resolve(filePath);
  const tmpRoot = path.resolve(os.tmpdir());
  const boundary = tmpRoot + path.sep;
  if (resolved !== tmpRoot && !resolved.startsWith(boundary)) {
    throw new Error(`Refusing fixture write outside ${tmpRoot}: ${resolved}`);
  }
  return resolved;
}

function writeText(filePath: string, value: string) {
  const safePath = safeFixturePath(filePath);
  fs.mkdirSync(path.dirname(safePath), { recursive: true });
  fs.writeFileSync(safePath, value);
}

describe('cleanupPulseArtifacts', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-artifacts-'));

    writeText(path.join(tempDir, '.pulse/tmp/old-run.tmp'), 'stale');
    writeText(path.join(tempDir, '.pulse/current/PULSE_CERTIFICATE.json'), '{"status":"stale"}');
    writeText(path.join(tempDir, 'PULSE_REPORT.md'), '# stale');
    writeText(path.join(tempDir, 'PULSE_FLOW_checkout-payment.json'), '{"legacy":true}');
    writeText(path.join(tempDir, 'AUDIT_FEATURE_MATRIX.md'), '# stale');
    writeText(path.join(tempDir, 'PULSE_CODACY_STATE.json'), '{"syncedAt":"now"}');
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('enforces a single-state artifact set while preserving Codacy input and canonical dir', () => {
    const registry = buildArtifactRegistry(tempDir);
    const cleanup = cleanupPulseArtifacts(registry);

    // Canonical and tmp dirs must always exist after GC (FASE 13 hardening).
    expect(fs.existsSync(path.join(tempDir, '.pulse/current'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.pulse/tmp'))).toBe(true);

    // Legacy ROOT artifacts (outside canonical) must be removed.
    expect(fs.existsSync(path.join(tempDir, 'PULSE_REPORT.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'PULSE_FLOW_checkout-payment.json'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'AUDIT_FEATURE_MATRIX.md'))).toBe(false);

    // Codacy snapshot is the only legacy root artifact preserved (it is an input).
    expect(fs.existsSync(path.join(tempDir, 'PULSE_CODACY_STATE.json'))).toBe(true);

    // Canonical dir contents are preserved across GC runs (FASE 13 hardening).
    expect(fs.existsSync(path.join(tempDir, '.pulse/current/PULSE_CERTIFICATE.json'))).toBe(true);

    expect(cleanup.cleanupMode).toBe('enforced-single-state');
    expect(cleanup.canonicalDir).toBe(path.join(tempDir, '.pulse/current'));
    expect(cleanup.removedLegacyPulseArtifacts).toEqual(
      expect.arrayContaining([
        'AUDIT_FEATURE_MATRIX.md',
        'PULSE_FLOW_checkout-payment.json',
        'PULSE_REPORT.md',
      ]),
    );
    // Canonical and tmp dirs must NOT be in the removed list (FASE 13 hardening).
    expect(cleanup.removedLegacyPulseArtifacts).not.toContain('.pulse/current');
    expect(cleanup.removedLegacyPulseArtifacts).not.toContain('.pulse/tmp');
  });
});
