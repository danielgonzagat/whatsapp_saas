import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkCircularImports } from '../parsers/circular-import-checker';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-circular-import-'));
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

function writeBackendFile(config: PulseConfig, relativePath: string, content: string): void {
  const file = path.join(config.backendDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('circular import checker', () => {
  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/circular-import-checker.ts',
    );

    expect(findings).toEqual([]);
  });

  it('reports circular NestJS module imports from decorator evidence', () => {
    const config = makeConfig();
    writeBackendFile(
      config,
      'alpha.module.ts',
      `
      import { Module } from '@nestjs/common';

      @Module({ imports: [BetaModule] })
      export class AlphaModule {}
      `,
    );
    writeBackendFile(
      config,
      'beta.module.ts',
      `
      import { Module } from '@nestjs/common';

      @Module({ imports: [AlphaModule] })
      export class BetaModule {}
      `,
    );

    const breaks = checkCircularImports(config);

    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatchObject({
      severity: 'high',
      file: 'backend/src/beta.module.ts',
      line: 5,
      source: 'circular-import-checker;detector=nestjs-module-cycle;truthMode=confirmed_static',
      surface: 'AlphaModule -> BetaModule -> AlphaModule',
    });
    expect(breaks[0]?.type).toContain('diagnostic:');
    expect(breaks[0]?.detail).toContain('predicates=');
  });

  it('does not report cycles already broken by forwardRef evidence', () => {
    const config = makeConfig();
    writeBackendFile(
      config,
      'alpha.module.ts',
      `
      import { Module, forwardRef } from '@nestjs/common';

      @Module({ imports: [BetaModule] })
      export class AlphaModule {}
      `,
    );
    writeBackendFile(
      config,
      'beta.module.ts',
      `
      import { Module, forwardRef } from '@nestjs/common';

      @Module({ imports: [forwardRef(() => AlphaModule)] })
      export class BetaModule {}
      `,
    );

    expect(checkCircularImports(config)).toEqual([]);
  });
});
