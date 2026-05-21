import { spawnSync } from 'child_process';
import * as path from 'path';

interface IncrementalRefreshFixtureResult {
  readonly watchRefreshMode: string;
  readonly baseHighIssues: number;
  readonly baseCodacyHighIssues: number;
  readonly refreshedIsNewObject: boolean;
  readonly coreDataPreserved: boolean;
  readonly healthPreserved: boolean;
  readonly parserInventoryPreserved: boolean;
  readonly refreshedHighIssues: number;
  readonly refreshedCodacyHighIssues: number;
  readonly refreshedCertificationHighIssues: number;
  readonly productVisionMentionsHighIssue: boolean;
}

function runIncrementalRefreshFixture(): IncrementalRefreshFixtureResult {
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
    parent.filename.includes(path.join('scripts', 'pulse'))
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

const { detectConfig } = require(path.join(repoRoot, 'scripts/pulse/config.ts'));
const {
  fullScan,
  getWatchRefreshMode,
  refreshScanResultForWatchChange,
} = require(path.join(repoRoot, 'scripts/pulse/daemon.ts'));

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function writeJson(filePath, value) {
  writeText(filePath, JSON.stringify(value, null, 2));
}

function buildCodacyState(highIssues) {
  const syncedAt = new Date().toISOString();
  if (highIssues === 0) {
    return {
      syncedAt,
      totalIssues: 0,
      bySeverity: { HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
      byTool: {},
      topFiles: [],
      highPriorityBatch: [],
      repositorySummary: { loc: 120 },
    };
  }

  return {
    syncedAt,
    totalIssues: highIssues,
    bySeverity: { HIGH: highIssues, MEDIUM: 0, LOW: 0, UNKNOWN: 0 },
    byTool: { eslint: highIssues },
    topFiles: [{ file: 'backend/src/widgets.service.ts', count: highIssues }],
    highPriorityBatch: Array.from({ length: highIssues }, (_, index) => ({
      issueId: 'issue-' + (index + 1),
      filePath: 'backend/src/widgets.service.ts',
      lineNumber: 3,
      patternId: 'no-risky-prisma-write',
      category: 'security',
      severityLevel: 'HIGH',
      tool: 'eslint',
      message: 'Simulated critical write issue',
    })),
    repositorySummary: { loc: 120 },
  };
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-daemon-refresh-'));
  try {
    writeText(
      path.join(tempDir, 'frontend/src/app/widgets/page.tsx'),
      "\nexport default function WidgetsPage() {\n  const handleSave = async () => {\n    await fetch('/api/widgets', { method: 'POST' });\n  };\n\n  return <button onClick={handleSave}>Save widget</button>;\n}\n",
    );
    writeText(
      path.join(tempDir, 'backend/src/widgets.controller.ts'),
      "\nimport { Controller, Post } from '@nestjs/common';\n\n@Controller('api/widgets')\nexport class WidgetsController {\n  constructor(private readonly widgetsService: WidgetsService) {}\n\n  @Post()\n  async save() {\n    return this.widgetsService.save();\n  }\n}\n",
    );
    writeText(
      path.join(tempDir, 'backend/src/widgets.service.ts'),
      "\nexport class WidgetsService {\n  constructor(\n    private readonly prisma: Record<string, { create(args: { data: Record<string, unknown> }): Promise<unknown> }>,\n  ) {}\n\n  async save() {\n    return this.prisma.widget.create({ data: {} as Record<string, unknown> });\n  }\n}\n",
    );
    writeText(path.join(tempDir, 'backend/prisma/schema.prisma'), '\nmodel Widget {\n  id String @id\n}\n');
    writeJson(path.join(tempDir, 'PULSE_CODACY_STATE.json'), buildCodacyState(0));

    const config = detectConfig(tempDir);
    const base = await fullScan(config);
    writeJson(path.join(tempDir, 'PULSE_CODACY_STATE.json'), buildCodacyState(1));
    const refreshed = await refreshScanResultForWatchChange(config, base, 'codacy');

    process.stdout.write(
      JSON.stringify({
        watchRefreshMode: getWatchRefreshMode('codacy'),
        baseHighIssues: base.scopeState.codacy.severityCounts.HIGH,
        baseCodacyHighIssues: base.codacyEvidence.summary.highIssues,
        refreshedIsNewObject: refreshed !== base,
        coreDataPreserved: refreshed.coreData === base.coreData,
        healthPreserved: refreshed.health === base.health,
        parserInventoryPreserved: refreshed.parserInventory === base.parserInventory,
        refreshedHighIssues: refreshed.scopeState.codacy.severityCounts.HIGH,
        refreshedCodacyHighIssues: refreshed.codacyEvidence.summary.highIssues,
        refreshedCertificationHighIssues: refreshed.certification.codacySummary?.severityCounts.HIGH ?? null,
        productVisionMentionsHighIssue: /1 HIGH Codacy issue/.test(refreshed.productVision.distanceSummary),
      }),
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
`;

  const result = spawnSync(process.execPath, ['--max-old-space-size=8192', '-e', script], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: { ...process.env, NODE_ENV: 'test' },
    maxBuffer: 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(`daemon incremental fixture failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }

  return JSON.parse(result.stdout) as IncrementalRefreshFixtureResult;
}

describe('PULSE daemon incremental refresh', () => {
  it('rebuilds only derived state when Codacy evidence changes', () => {
    const refreshed = runIncrementalRefreshFixture();

    expect(refreshed.watchRefreshMode).toBe('derived');
    expect(refreshed.baseHighIssues).toBe(0);
    expect(refreshed.baseCodacyHighIssues).toBe(0);
    expect(refreshed.refreshedIsNewObject).toBe(true);
    expect(refreshed.coreDataPreserved).toBe(true);
    expect(refreshed.healthPreserved).toBe(true);
    expect(refreshed.parserInventoryPreserved).toBe(true);
    expect(refreshed.refreshedHighIssues).toBe(1);
    expect(refreshed.refreshedCodacyHighIssues).toBe(1);
    expect(refreshed.refreshedCertificationHighIssues).toBe(1);
    expect(refreshed.productVisionMentionsHighIssue).toBe(true);
  });
});
