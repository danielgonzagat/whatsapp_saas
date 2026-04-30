import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import {
  buildSecurityXssProbePlan,
  containsRawScriptTag,
  isJsonResponse,
} from '../parsers/security-xss';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-security-xss-'));
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

describe('security xss parser', () => {
  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/security-xss.ts',
    );

    expect(findings).toEqual([]);
  });

  it('derives xss probe targets from discovered controller and body evidence', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/opaque.controller.ts',
      `
      import { Body, Controller, Post } from '@nestjs/common';

      class OpaqueDto {
        title!: string;
        amount!: number;
      }

      @Controller('opaque')
      export class OpaqueController {
        @Post('entries')
        create(@Body() dto: OpaqueDto) {
          return dto;
        }
      }
      `,
    );

    const plan = buildSecurityXssProbePlan(config);

    expect(plan.targets).toHaveLength(1);
    expect(plan.targets[0]).toMatchObject({
      method: 'POST',
      path: '/opaque/entries',
      body: { title: plan.markupPayload, amount: 1 },
    });
    expect(containsRawScriptTag({ value: plan.markupPayload })).toBe(true);
    expect(isJsonResponse({ 'content-type': 'application/json; charset=utf-8' })).toBe(true);
  });
});
