import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { pathToFileURL } from 'url';
import { buildArtifactRegistry } from '../../../scripts/pulse/artifact-registry';
import { cleanupPulseArtifacts } from '../../../scripts/pulse/artifact-gc';

const FIXTURE_RELATIVE_PATHS = {
  auditFeatureMatrix: 'AUDIT_FEATURE_MATRIX.md',
  codacyState: 'PULSE_CODACY_STATE.json',
  currentCertificate: '.pulse/current/PULSE_CERTIFICATE.json',
  legacyCheckoutFlow: 'PULSE_FLOW_checkout-payment.json',
  legacyPulseReport: 'PULSE_REPORT.md',
  staleTmpRun: '.pulse/tmp/old-run.tmp',
} as const;

type FixtureName = keyof typeof FIXTURE_RELATIVE_PATHS;
type FixtureRoot = URL;

function writeFixture(rootUrl: FixtureRoot, name: FixtureName, value: string) {
  switch (name) {
    case 'staleTmpRun':
      fs.mkdirSync(new URL('.pulse/tmp/', rootUrl), { recursive: true });
      fs.writeFileSync(new URL(FIXTURE_RELATIVE_PATHS.staleTmpRun, rootUrl), value);
      return;
    case 'currentCertificate':
      fs.mkdirSync(new URL('.pulse/current/', rootUrl), { recursive: true });
      fs.writeFileSync(new URL(FIXTURE_RELATIVE_PATHS.currentCertificate, rootUrl), value);
      return;
    case 'legacyPulseReport':
      fs.writeFileSync(new URL(FIXTURE_RELATIVE_PATHS.legacyPulseReport, rootUrl), value);
      return;
    case 'legacyCheckoutFlow':
      fs.writeFileSync(new URL(FIXTURE_RELATIVE_PATHS.legacyCheckoutFlow, rootUrl), value);
      return;
    case 'auditFeatureMatrix':
      fs.writeFileSync(new URL(FIXTURE_RELATIVE_PATHS.auditFeatureMatrix, rootUrl), value);
      return;
    case 'codacyState':
      fs.writeFileSync(new URL(FIXTURE_RELATIVE_PATHS.codacyState, rootUrl), value);
      return;
  }
}

describe('cleanupPulseArtifacts', () => {
  let tempDir: string;
  let fixtureRoot: FixtureRoot;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-artifacts-'));
    fixtureRoot = pathToFileURL(`${tempDir}${path.sep}`);

    writeFixture(fixtureRoot, 'staleTmpRun', 'stale');
    writeFixture(fixtureRoot, 'currentCertificate', '{"status":"stale"}');
    writeFixture(fixtureRoot, 'legacyPulseReport', '# stale');
    writeFixture(fixtureRoot, 'legacyCheckoutFlow', '{"legacy":true}');
    writeFixture(fixtureRoot, 'auditFeatureMatrix', '# stale');
    writeFixture(fixtureRoot, 'codacyState', '{"syncedAt":"now"}');
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
