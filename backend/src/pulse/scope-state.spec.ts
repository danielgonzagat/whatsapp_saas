import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildScopeState } from '../../../scripts/pulse/scope-state';

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

describe('buildScopeState', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-scope-'));

    writeJson(path.join(tempDir, 'ops/protected-governance-files.json'), {
      protectedExact: ['package.json'],
      protectedPrefixes: ['scripts/ops/'],
    });

    writeText(
      path.join(tempDir, 'frontend/src/app/dashboard/page.tsx'),
      `export default function Page() { return <div>Dashboard</div>; }\n`,
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
      bySeverity: {
        HIGH: 1,
        MEDIUM: 2,
        LOW: 2,
        UNKNOWN: 0,
      },
      byTool: {
        Opengrep: 1,
      },
      repositorySummary: {
        loc: 42,
      },
      topFiles: [
        {
          file: 'scripts/ops/collect-ratchet-metrics.mjs',
          count: 1,
        },
      ],
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
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('builds repo-wide parity and marks protected files as human required', () => {
    const scopeState = buildScopeState(tempDir);

    expect(scopeState.parity.status).toBe('pass');
    expect(scopeState.parity.missingCodacyFiles).toEqual([]);

    const protectedFile = scopeState.files.find(
      (entry) => entry.path === 'scripts/ops/collect-ratchet-metrics.mjs',
    );
    expect(protectedFile).toMatchObject({
      surface: 'governance',
      executionMode: 'human_required',
      protectedByGovernance: true,
      highSeverityIssueCount: 1,
    });

    const frontendFile = scopeState.files.find(
      (entry) => entry.path === 'frontend/src/app/dashboard/page.tsx',
    );
    expect(frontendFile).toMatchObject({
      surface: 'frontend',
      userFacing: true,
      executionMode: 'ai_safe',
      moduleCandidate: 'dashboard',
    });

    expect(
      scopeState.files.some((entry) => entry.path === '.pulse/current/PULSE_CERTIFICATE.json'),
    ).toBe(false);
    expect(scopeState.files.some((entry) => entry.path === 'PULSE_REPORT.md')).toBe(false);
    expect(scopeState.files.some((entry) => entry.path === 'PULSE_CODACY_STATE.json')).toBe(true);
  });
});
