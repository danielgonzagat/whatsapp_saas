import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkPerformanceQueryProfiler } from '../parsers/performance-query-profiler';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-query-profiler-'));
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
  const file = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('performance query profiler dynamic evidence', () => {
  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const findings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/performance-query-profiler.ts',
    );

    expect(findings).toEqual([]);
  });

  it('derives query diagnostics from AST evidence instead of fixed break labels', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/customer.service.ts',
      `
      export class CustomerService {
        constructor(private readonly prisma: { customer: { findMany(input?: unknown): Promise<unknown[]> } }) {}

        allCustomers() {
          return this.prisma.customer.findMany({
            where: { active: true },
            orderBy: { createdAt: 'desc' },
          });
        }

        projectedPage() {
          return this.prisma.customer.findMany({
            select: { id: true },
            take: 20,
          });
        }
      }
      `,
    );

    const findings = checkPerformanceQueryProfiler(config);

    expect(findings).toEqual([
      expect.objectContaining({
        type: 'diagnostic:performance-query-profiler:field-projection-not-observed',
        file: 'backend/src/customer.service.ts',
        line: 6,
      }),
      expect.objectContaining({
        type: 'diagnostic:performance-query-profiler:result-bound-not-observed',
        file: 'backend/src/customer.service.ts',
        line: 6,
      }),
    ]);
  });
});
