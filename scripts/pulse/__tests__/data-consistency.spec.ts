import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkDataConsistency } from '../parsers/data-consistency';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-data-consistency-'));
  tempRoots.push(rootDir);
  return rootDir;
}

function pulseConfig(rootDir: string): PulseConfig {
  return {
    rootDir,
    backendDir: path.join(rootDir, 'backend/src'),
    frontendDir: path.join(rootDir, 'frontend'),
    workerDir: path.join(rootDir, 'worker'),
    schemaPath: path.join(rootDir, 'backend/prisma/schema.prisma'),
    globalPrefix: '',
  };
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const file = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('data consistency parser', () => {
  afterEach(() => {
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps the parser source free of hardcoded reality audit findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/data-consistency.ts',
    );

    expect(findings).toEqual([]);
  });

  it('derives numeric consistency risk from Prisma schema evidence and local dataflow', () => {
    const rootDir = makeTempRoot();
    writeFile(
      rootDir,
      'backend/prisma/schema.prisma',
      `
      model Metric {
        id String @id
        value Decimal
      }
      `,
    );
    writeFile(
      rootDir,
      'backend/src/metric.service.ts',
      `
      export class MetricService {
        async createMetric() {
          return this.prisma.metric.create({ data: { value: 42 } });
        }
      }
      `,
    );

    const breaks = checkDataConsistency(pulseConfig(rootDir));

    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'DATA_PRODUCT_NO_PLAN',
        file: path.join(rootDir, 'backend/src/metric.service.ts'),
      }),
    ]);
  });

  it('accepts schema-derived numeric writes with a read guard before the write', () => {
    const rootDir = makeTempRoot();
    writeFile(
      rootDir,
      'backend/prisma/schema.prisma',
      `
      model Metric {
        id String @id
        value Decimal
      }
      `,
    );
    writeFile(
      rootDir,
      'backend/src/metric.service.ts',
      `
      export class MetricService {
        async createMetric(metricId: string) {
          await this.prisma.metric.findUnique({ where: { id: metricId } });
          return this.prisma.metric.create({ data: { value: 42 } });
        }
      }
      `,
    );

    expect(checkDataConsistency(pulseConfig(rootDir))).toEqual([]);
  });
});
