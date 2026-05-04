import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkOrderingTiming } from '../parsers/ordering-timing-checker';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ordering-timing-'));
  const backendDir = path.join(rootDir, 'backend', 'src');
  const frontendDir = path.join(rootDir, 'frontend', 'src');
  const workerDir = path.join(rootDir, 'worker');
  const schemaPath = path.join(rootDir, 'backend', 'prisma', 'schema.prisma');

  fs.mkdirSync(backendDir, { recursive: true });
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });

  return { rootDir, backendDir, frontendDir, workerDir, schemaPath, globalPrefix: '' };
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

describe('ordering timing checker diagnostics', () => {
  it('keeps local timezone diagnostics active for material report signals', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/reports/revenue.service.ts',
      `
      export class RevenueService {
        summarize() {
          return {
            total: 1200,
            label: new Date().toLocaleDateString('pt-BR'),
          };
        }
      }
      `,
    );

    expect(checkOrderingTiming(config)).toContainEqual(
      expect.objectContaining({
        type: 'temporal-consistency-evidence-gap',
        file: 'backend/src/reports/revenue.service.ts',
        source: 'parser:weak_signal:temporal-consistency',
        surface: 'temporal-correctness',
      }),
    );
  });

  it('keeps ordering timing checker free of hardcoded reality authority findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const checkerFindings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/ordering-timing-checker.ts',
    );

    expect(checkerFindings).toEqual([]);
  });
});
