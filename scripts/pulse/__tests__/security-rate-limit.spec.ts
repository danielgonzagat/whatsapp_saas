import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import {
  buildSecurityRateLimitProbePlan,
  checkSecurityRateLimit,
} from '../parsers/security-rate-limit';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-security-rate-limit-'));
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

describe('security rate limit parser', () => {
  it('keeps the parser source free of hardcoded reality audit findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/security-rate-limit.ts',
    );

    expect(findings).toEqual([]);
  });

  it('derives probe targets and observed limits from NestJS source evidence', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/app.module.ts',
      `
      import { Module } from '@nestjs/common';
      import { ThrottlerModule } from '@nestjs/throttler';

      @Module({
        imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 19 }])],
      })
      export class AppModule {}
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/opaque.controller.ts',
      `
      import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
      import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

      @Controller('opaque')
      @UseGuards(ThrottlerGuard)
      @Throttle({ default: { ttl: 60000, limit: 7 } })
      export class OpaqueController {
        @Post(':workspaceId/state')
        write(@Param('workspaceId') workspaceId: string, @Body() body: unknown) {
          return { workspaceId, body };
        }

        @Get('state')
        read() {
          return { ok: true };
        }
      }
      `,
    );

    expect(buildSecurityRateLimitProbePlan(config)).toEqual({
      hasGlobalThrottleEvidence: true,
      globalLimit: 19,
      routes: [
        expect.objectContaining({
          method: 'POST',
          path: '/opaque/:workspaceId/state',
          hasThrottleEvidence: true,
          hasGuardEvidence: true,
          hasBodyEvidence: true,
          observedLimit: 7,
        }),
        expect.objectContaining({
          method: 'GET',
          path: '/opaque/state',
          hasThrottleEvidence: true,
          observedLimit: 7,
        }),
      ],
    });
  });

  it('emits synthesized diagnostics from missing throttle evidence without fixed break types', async () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/opaque.controller.ts',
      `
      import { Body, Controller, Post } from '@nestjs/common';

      @Controller('opaque')
      export class OpaqueController {
        @Post('state')
        write(@Body() body: unknown) {
          return body;
        }
      }
      `,
    );

    await expect(checkSecurityRateLimit(config)).resolves.toEqual([
      expect.objectContaining({
        type: expect.stringMatching(/^diagnostic:/),
        surface: 'security-rate-limit:global',
      }),
      expect.objectContaining({
        type: expect.stringMatching(/^diagnostic:/),
        surface: 'security-rate-limit:post:/opaque/state',
        source: expect.stringContaining('detector=route-throttle-evidence'),
      }),
    ]);
  });
});
