import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkApiResponseConsistency } from '../parsers/api-response-consistency';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-api-response-consistency-'));
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

function writeController(config: PulseConfig, relativePath: string, source: string): void {
  const target = path.join(config.backendDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source, 'utf8');
}

describe('api response consistency diagnostics', () => {
  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const findings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/api-response-consistency.ts',
    );

    expect(findings).toEqual([]);
  });

  it('emits generated diagnostics from response-shape and exception evidence', () => {
    const config = makeConfig();
    writeController(
      config,
      'orders.controller.ts',
      `
      import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';

      @Controller('orders')
      export class OrdersController {
        @Get('wrapped')
        wrapped() {
          return { data: [] };
        }

        @Get('raw')
        raw() {
          return this.service.list();
        }

        @Get('error')
        error() {
          try {
            return this.service.fail();
          } catch (error) {
            throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
          }
        }
      }
      `,
    );

    const findings = checkApiResponseConsistency(config);

    expect(findings).toHaveLength(2);
    expect(findings.map((finding) => finding.type)).toEqual([
      expect.stringMatching(/^diagnostic:/),
      expect.stringMatching(/^diagnostic:/),
    ]);
    expect(findings.map((finding) => finding.source)).toEqual([
      expect.stringContaining('detector=exception-message-status-evidence'),
      expect.stringContaining('detector=mixed-controller-return-shape-evidence'),
    ]);
    expect(findings.map((finding) => finding.surface)).toEqual([
      'api-error-response',
      'api-response-shape',
    ]);
  });
});
