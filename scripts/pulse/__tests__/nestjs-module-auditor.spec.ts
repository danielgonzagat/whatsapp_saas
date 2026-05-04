import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkNestJSModules } from '../parsers/nestjs-module-auditor';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-nestjs-module-auditor-'));
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

describe('NestJS module auditor dynamic evidence', () => {
  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/nestjs-module-auditor.ts',
    );

    expect(findings).toEqual([]);
  });

  it('derives provider checks from local Injectable evidence instead of framework allowlists', () => {
    const config = makeConfig();

    writeFile(
      config.rootDir,
      'backend/src/reports/reports.module.ts',
      `
      import { Module } from '@nestjs/common';
      import { ReportsController } from './reports.controller';
      import { ReportsService } from './reports.service';

      @Module({
        controllers: [ReportsController],
        providers: [ReportsService],
      })
      export class ReportsModule {}
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/reports/reports.controller.ts',
      `
      import { Controller } from '@nestjs/common';
      import { ReportsService } from './reports.service';

      @Controller('reports')
      export class ReportsController {
        constructor(private readonly reportsService: ReportsService) {}
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/reports/reports.service.ts',
      `
      import { Injectable } from '@nestjs/common';
      import { ConfigService } from '@nestjs/config';
      import { MissingLocalService } from './missing-local.service';

      @Injectable()
      export class ReportsService {
        constructor(
          private readonly configService: ConfigService,
          private readonly missingLocalService: MissingLocalService,
        ) {}
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/reports/missing-local.service.ts',
      `
      import { Injectable } from '@nestjs/common';

      @Injectable()
      export class MissingLocalService {}
      `,
    );

    expect(checkNestJSModules(config)).toEqual([
      expect.objectContaining({
        type: 'SERVICE_NOT_PROVIDED',
        file: 'backend/src/reports/reports.service.ts',
        description: 'Injected service "MissingLocalService" not found in module providers',
      }),
    ]);
  });
});
