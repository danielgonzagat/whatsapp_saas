import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectConfig } from '../../../scripts/pulse/config';
import {
  fullScan,
  getWatchRefreshMode,
  refreshScanResultForWatchChange,
} from '../../../scripts/pulse/daemon';

function writeText(filePath: string, value: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function writeJson(filePath: string, value: unknown) {
  writeText(filePath, JSON.stringify(value, null, 2));
}

function buildCodacyState(highIssues: number) {
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
    topFiles: [
      {
        file: 'backend/src/widgets.service.ts',
        count: highIssues,
      },
    ],
    highPriorityBatch: Array.from({ length: highIssues }, (_, index) => ({
      issueId: `issue-${index + 1}`,
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

describe('PULSE daemon incremental refresh', () => {
  let tempDir = '';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-daemon-refresh-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('rebuilds only derived state when Codacy evidence changes', async () => {
    writeText(
      path.join(tempDir, 'frontend/src/app/widgets/page.tsx'),
      `
export default function WidgetsPage() {
  const handleSave = async () => {
    await fetch('/api/widgets', { method: 'POST' });
  };

  return <button onClick={handleSave}>Save widget</button>;
}
`,
    );
    writeText(
      path.join(tempDir, 'backend/src/widgets.controller.ts'),
      `
import { Controller, Post } from '@nestjs/common';

@Controller('api/widgets')
export class WidgetsController {
  constructor(private readonly widgetsService: WidgetsService) {}

  @Post()
  async save() {
    return this.widgetsService.save();
  }
}
`,
    );
    writeText(
      path.join(tempDir, 'backend/src/widgets.service.ts'),
      `
export class WidgetsService {
  constructor(private readonly prisma: any) {}

  async save() {
    return this.prisma.widget.create({ data: {} as any });
  }
}
`,
    );
    writeText(
      path.join(tempDir, 'backend/prisma/schema.prisma'),
      `
model Widget {
  id String @id
}
`,
    );
    writeJson(path.join(tempDir, 'PULSE_CODACY_STATE.json'), buildCodacyState(0));

    const config = detectConfig(tempDir);
    const base = await fullScan(config);

    expect(getWatchRefreshMode('codacy')).toBe('derived');
    expect(base.scopeState.codacy.severityCounts.HIGH).toBe(0);
    expect(base.codacyEvidence.summary.highIssues).toBe(0);

    writeJson(path.join(tempDir, 'PULSE_CODACY_STATE.json'), buildCodacyState(1));

    const refreshed = await refreshScanResultForWatchChange(config, base, 'codacy');

    expect(refreshed).not.toBe(base);
    expect(refreshed.coreData).toBe(base.coreData);
    expect(refreshed.health).toBe(base.health);
    expect(refreshed.parserInventory).toBe(base.parserInventory);
    expect(refreshed.scopeState.codacy.severityCounts.HIGH).toBe(1);
    expect(refreshed.codacyEvidence.summary.highIssues).toBe(1);
    expect(refreshed.certification.codacySummary?.severityCounts.HIGH).toBe(1);
    expect(refreshed.productVision.distanceSummary).toMatch(/1 HIGH Codacy issue/);
  });
});
