import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import {
  buildSecurityCrossWorkspacePlan,
  checkSecurityCrossWorkspace,
} from '../parsers/security-cross-workspace';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-security-cross-workspace-'));
  tempRoots.push(rootDir);
  return rootDir;
}

function pulseConfig(rootDir: string): PulseConfig {
  return {
    rootDir,
    frontendDir: path.join(rootDir, 'frontend'),
    backendDir: path.join(rootDir, 'backend/src'),
    workerDir: path.join(rootDir, 'worker'),
    schemaPath: path.join(rootDir, 'backend/prisma/schema.prisma'),
    globalPrefix: '',
  };
}

function writeSource(rootDir: string, relativePath: string, content: string): void {
  const filePath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

describe('security cross-workspace parser', () => {
  afterEach(() => {
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('derives probe surfaces from controller evidence instead of a fixed route catalog', () => {
    const rootDir = makeTempRoot();
    writeSource(
      rootDir,
      'backend/src/opaque-area.controller.ts',
      `
      import { Controller, Get, Post } from '@nestjs/common';

      @Controller('opaque-area')
      export class OpaqueAreaController {
        @Get()
        list() {
          return [];
        }

        @Get(':id')
        read() {
          return null;
        }

        @Post()
        create() {
          return null;
        }
      }
      `,
    );

    const plan = buildSecurityCrossWorkspacePlan(pulseConfig(rootDir));

    expect(plan).toEqual([
      expect.objectContaining({
        collectionPath: '/opaque-area',
        createPath: '/opaque-area',
        controllerName: 'OpaqueAreaController',
        handlerName: 'list',
      }),
    ]);
  });

  it('does not run runtime probes outside DEEP mode', async () => {
    const rootDir = makeTempRoot();
    const previous = process.env.PULSE_DEEP;
    delete process.env.PULSE_DEEP;

    try {
      await expect(checkSecurityCrossWorkspace(pulseConfig(rootDir))).resolves.toEqual([]);
    } finally {
      if (previous) {
        process.env.PULSE_DEEP = previous;
      }
    }
  });

  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/security-cross-workspace.ts',
    );

    expect(findings).toEqual([]);
  });
});
