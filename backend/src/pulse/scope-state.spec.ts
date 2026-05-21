import { spawnSync } from 'child_process';
import * as path from 'path';

interface ScopeStateFixtureResult {
  readonly parityStatus: string;
  readonly missingCodacyFiles: readonly string[];
  readonly protectedFile: {
    readonly surface: string;
    readonly executionMode: string;
    readonly protectedByGovernance: boolean;
    readonly highSeverityIssueCount: number;
  } | null;
  readonly frontendFile: {
    readonly surface: string;
    readonly userFacing: boolean;
    readonly executionMode: string;
    readonly moduleCandidate: string | null;
  } | null;
  readonly includesCanonicalCertificate: boolean;
  readonly includesLegacyReport: boolean;
  readonly includesCodacyState: boolean;
}

function runScopeStateFixture(): ScopeStateFixtureResult {
  const repoRoot = path.resolve(__dirname, '../../..');
  const script = String.raw`
const fs = require('fs');
const os = require('os');
const path = require('path');
const ts = require('typescript');

const repoRoot = process.cwd();
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

const { buildScopeState } = require(path.join(repoRoot, 'scripts/pulse/scope-state.ts'));

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-scope-'));
try {
  writeJson(path.join(tempDir, 'ops/protected-governance-files.json'), {
    protectedExact: ['package.json'],
    protectedPrefixes: ['scripts/ops/'],
  });

  writeText(
    path.join(tempDir, 'frontend/src/app/dashboard/page.tsx'),
    'export default function Page() { return <div>Dashboard</div>; }\n',
  );
  writeText(
    path.join(tempDir, 'scripts/ops/collect-ratchet-metrics.mjs'),
    'export function collect() { return 1; }\n',
  );
  writeText(path.join(tempDir, '.pulse/current/PULSE_CERTIFICATE.json'), '{"status":"old"}\n');
  writeText(path.join(tempDir, 'PULSE_REPORT.md'), '# legacy\n');

  writeJson(path.join(tempDir, 'PULSE_CODACY_STATE.json'), {
    syncedAt: new Date().toISOString(),
    totalIssues: 5,
    bySeverity: { HIGH: 1, MEDIUM: 2, LOW: 2, UNKNOWN: 0 },
    byTool: { Opengrep: 1 },
    repositorySummary: { loc: 42 },
    topFiles: [{ file: 'scripts/ops/collect-ratchet-metrics.mjs', count: 1 }],
    highPriorityBatch: [
      {
        issueId: 'issue_1',
        filePath: 'scripts/ops/collect-ratchet-metrics.mjs',
        lineNumber: 1,
        patternId: 'security.rule',
        category: 'Security',
        severityLevel: 'High',
        tool: 'Opengrep',
        message: 'Security hotspot',
        commitSha: null,
        commitTimestamp: null,
      },
    ],
  });

  const scopeState = buildScopeState(tempDir);
  const protectedFile = scopeState.files.find(
    (entry) => entry.path === 'scripts/ops/collect-ratchet-metrics.mjs',
  );
  const frontendFile = scopeState.files.find(
    (entry) => entry.path === 'frontend/src/app/dashboard/page.tsx',
  );

  process.stdout.write(
    JSON.stringify({
      parityStatus: scopeState.parity.status,
      missingCodacyFiles: scopeState.parity.missingCodacyFiles,
      protectedFile: protectedFile
        ? {
            surface: protectedFile.surface,
            executionMode: protectedFile.executionMode,
            protectedByGovernance: protectedFile.protectedByGovernance,
            highSeverityIssueCount: protectedFile.highSeverityIssueCount,
          }
        : null,
      frontendFile: frontendFile
        ? {
            surface: frontendFile.surface,
            userFacing: frontendFile.userFacing,
            executionMode: frontendFile.executionMode,
            moduleCandidate: frontendFile.moduleCandidate,
          }
        : null,
      includesCanonicalCertificate: scopeState.files.some(
        (entry) => entry.path === '.pulse/current/PULSE_CERTIFICATE.json',
      ),
      includesLegacyReport: scopeState.files.some((entry) => entry.path === 'PULSE_REPORT.md'),
      includesCodacyState: scopeState.files.some((entry) => entry.path === 'PULSE_CODACY_STATE.json'),
    }),
  );
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
    throw new Error(`scope state fixture failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  return JSON.parse(result.stdout) as ScopeStateFixtureResult;
}

describe('buildScopeState', () => {
  it('builds repo-wide parity and marks protected files as observation only', () => {
    const scopeState = runScopeStateFixture();

    expect(scopeState.parityStatus).toBe('pass');
    expect(scopeState.missingCodacyFiles).toEqual([]);
    expect(scopeState.protectedFile).toMatchObject({
      surface: 'governance',
      executionMode: 'observation_only',
      protectedByGovernance: true,
      highSeverityIssueCount: 1,
    });
    expect(scopeState.frontendFile).toMatchObject({
      surface: 'frontend',
      userFacing: true,
      executionMode: 'ai_safe',
      moduleCandidate: 'dashboard',
    });
    expect(scopeState.includesCanonicalCertificate).toBe(false);
    expect(scopeState.includesLegacyReport).toBe(false);
    expect(scopeState.includesCodacyState).toBe(true);
  });
});
