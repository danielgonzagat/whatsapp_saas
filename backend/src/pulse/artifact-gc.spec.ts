import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildArtifactRegistry } from '../../../scripts/pulse/artifact-registry';
import { cleanupPulseArtifacts } from '../../../scripts/pulse/artifact-gc';

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
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

  it('enforces a single-state artifact set while preserving Codacy input', () => {
    const registry = buildArtifactRegistry(tempDir);
    const cleanup = cleanupPulseArtifacts(registry);

    expect(fs.existsSync(path.join(tempDir, '.pulse/current'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, '.pulse/tmp'))).toBe(true);
    expect(fs.readdirSync(path.join(tempDir, '.pulse/current'))).toEqual([]);
    expect(fs.readdirSync(path.join(tempDir, '.pulse/tmp'))).toEqual([]);

    expect(fs.existsSync(path.join(tempDir, 'PULSE_REPORT.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'PULSE_FLOW_checkout-payment.json'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'AUDIT_FEATURE_MATRIX.md'))).toBe(false);
    expect(fs.existsSync(path.join(tempDir, 'PULSE_CODACY_STATE.json'))).toBe(true);

    expect(cleanup.cleanupMode).toBe('enforced-single-state');
    expect(cleanup.canonicalDir).toBe(path.join(tempDir, '.pulse/current'));
    expect(cleanup.removedLegacyPulseArtifacts).toEqual(
      expect.arrayContaining([
        '.pulse/current',
        '.pulse/tmp',
        'AUDIT_FEATURE_MATRIX.md',
        'PULSE_FLOW_checkout-payment.json',
        'PULSE_REPORT.md',
      ]),
    );
  });
});
