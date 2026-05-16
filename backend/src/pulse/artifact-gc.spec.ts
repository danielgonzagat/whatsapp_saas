import { spawnSync } from 'child_process';
import * as path from 'path';

interface ArtifactGcFixtureResult {
  readonly currentDirExists: boolean;
  readonly tempDirExists: boolean;
  readonly legacyPulseReportExists: boolean;
  readonly legacyCheckoutFlowExists: boolean;
  readonly auditFeatureMatrixExists: boolean;
  readonly codacyStateExists: boolean;
  readonly currentCertificateExists: boolean;
  readonly cleanupMode: string;
  readonly canonicalDir: string;
  readonly expectedCanonicalDir: string;
  readonly removedLegacyPulseArtifacts: string[];
}

function runArtifactGcFixture(): ArtifactGcFixtureResult {
  const repoRoot = path.resolve(__dirname, '../../..');
  const script = String.raw`
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const repoRoot = process.cwd();
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (
    request === './external-signals/snapshot-config' &&
    parent &&
    parent.filename.endsWith(path.join('scripts', 'pulse', 'artifact-gc.ts'))
  ) {
    return { PULSE_EXTERNAL_INPUT_FILES: ['PULSE_CODACY_STATE.json'] };
  }
  return originalLoad.apply(this, arguments);
};

require.extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

const { cleanupPulseArtifacts } = require(path.join(repoRoot, 'scripts/pulse/artifact-gc.ts'));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-artifacts-'));

function writeFixture(relativePath, value) {
  const targetPath = path.join(tempDir, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, value);
}

try {
  writeFixture('.pulse/tmp/old-run.tmp', 'stale');
  writeFixture('.pulse/current/PULSE_CERTIFICATE.json', '{"status":"stale"}');
  writeFixture('PULSE_REPORT.md', '# stale');
  writeFixture('PULSE_FLOW_checkout-payment.json', '{"legacy":true}');
  writeFixture('AUDIT_FEATURE_MATRIX.md', '# stale');
  writeFixture('PULSE_CODACY_STATE.json', '{"syncedAt":"now"}');

  const registry = {
    rootDir: tempDir,
    canonicalDir: path.join(tempDir, '.pulse/current'),
    tempDir: path.join(tempDir, '.pulse/tmp'),
    artifacts: [],
    mirrors: [],
  };
  const cleanup = cleanupPulseArtifacts(registry);
  const result = {
    currentDirExists: fs.existsSync(path.join(tempDir, '.pulse/current')),
    tempDirExists: fs.existsSync(path.join(tempDir, '.pulse/tmp')),
    legacyPulseReportExists: fs.existsSync(path.join(tempDir, 'PULSE_REPORT.md')),
    legacyCheckoutFlowExists: fs.existsSync(path.join(tempDir, 'PULSE_FLOW_checkout-payment.json')),
    auditFeatureMatrixExists: fs.existsSync(path.join(tempDir, 'AUDIT_FEATURE_MATRIX.md')),
    codacyStateExists: fs.existsSync(path.join(tempDir, 'PULSE_CODACY_STATE.json')),
    currentCertificateExists: fs.existsSync(path.join(tempDir, '.pulse/current/PULSE_CERTIFICATE.json')),
    cleanupMode: cleanup.cleanupMode,
    canonicalDir: cleanup.canonicalDir,
    expectedCanonicalDir: path.join(tempDir, '.pulse/current'),
    removedLegacyPulseArtifacts: cleanup.removedLegacyPulseArtifacts,
  };
  process.stdout.write(JSON.stringify(result));
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
`;

  const result = spawnSync(process.execPath, ['--max-old-space-size=8192', '-e', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test' },
    maxBuffer: 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(`artifact-gc fixture failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  return JSON.parse(result.stdout) as ArtifactGcFixtureResult;
}

describe('cleanupPulseArtifacts', () => {
  it('enforces a single-state artifact set while preserving Codacy input and canonical dir', () => {
    const cleanup = runArtifactGcFixture();

    expect(cleanup.currentDirExists).toBe(true);
    expect(cleanup.tempDirExists).toBe(true);

    expect(cleanup.legacyPulseReportExists).toBe(false);
    expect(cleanup.legacyCheckoutFlowExists).toBe(false);
    expect(cleanup.auditFeatureMatrixExists).toBe(false);

    expect(cleanup.codacyStateExists).toBe(true);
    expect(cleanup.currentCertificateExists).toBe(true);

    expect(cleanup.cleanupMode).toBe('enforced-single-state');
    expect(cleanup.canonicalDir).toBe(cleanup.expectedCanonicalDir);
    expect(cleanup.removedLegacyPulseArtifacts).toEqual(
      expect.arrayContaining([
        'AUDIT_FEATURE_MATRIX.md',
        'PULSE_FLOW_checkout-payment.json',
        'PULSE_REPORT.md',
      ]),
    );
    expect(cleanup.removedLegacyPulseArtifacts).not.toContain('.pulse/current');
    expect(cleanup.removedLegacyPulseArtifacts).not.toContain('.pulse/tmp');
  });
});
