import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { buildSecurityInjectionPlan } from '../parsers/security-injection';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-security-injection-'));
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

describe('security injection parser dynamic evidence', () => {
  it('derives injection targets and payload table names from discovered code evidence', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/prisma/schema.prisma',
      `
      model OpaqueAudit {
        id String @id
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/opaque.controller.ts',
      `
      import { Body, Controller, Get, Post } from '@nestjs/common';

      class OpaqueDto {
        alpha!: string;
        quantity!: number;
      }

      @Controller('opaque-area')
      export class OpaqueController {
        @Post('submit')
        submit(@Body() dto: OpaqueDto) {
          return dto;
        }

        @Get(':id')
        read() {
          return null;
        }
      }
      `,
    );

    const plan = buildSecurityInjectionPlan(config);

    expect(plan.endpoints).toHaveLength(1);
    expect(plan.endpoints[0].path).toBe('/opaque-area/submit');
    expect(plan.endpoints[0].buildBody('probe')).toEqual({ alpha: 'probe', quantity: 1 });
    expect(plan.payloads.some((payload) => payload.includes('OpaqueAudit'))).toBe(true);
    expect(plan.traversalPaths.some((routePath) => routePath.includes('/opaque-area/:id/'))).toBe(
      true,
    );
  });

  it('keeps the security injection parser free of hardcoded reality authority findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const securityInjectionFindings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/security-injection.ts',
    );

    expect(securityInjectionFindings).toEqual([]);
  });
});
