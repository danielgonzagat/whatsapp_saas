import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { buildApiContractProbePlan } from '../parsers/api-contract-tester';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-api-contract-'));
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

describe('api contract tester dynamic evidence', () => {
  it('keeps the API contract parser free of hardcoded reality authority findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const findings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/api-contract-tester.ts',
    );

    expect(findings).toEqual([]);
  });

  it('builds probes from OpenAPI schema and controller evidence instead of a fixed endpoint list', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'openapi.json',
      JSON.stringify({
        openapi: '3.0.0',
        paths: {
          '/opaque/readiness': {
            get: {
              responses: {
                '200': {
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: {
                          status: { type: 'string' },
                          generatedAt: { type: 'string' },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    );
    writeFile(
      config.rootDir,
      'backend/src/opaque.controller.ts',
      `
      import { Controller, Get, Post } from '@nestjs/common';

      @Controller('opaque')
      export class OpaqueController {
        @Get('state')
        readState() { return { ok: true }; }

        @Post('state')
        writeState() { return { ok: true }; }
      }
      `,
    );

    expect(buildApiContractProbePlan(config)).toEqual([
      { path: '/opaque/readiness', expectedFields: ['status', 'generatedAt'] },
      { path: '/opaque/state', expectedFields: [] },
    ]);
  });
});
