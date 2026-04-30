import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkInfraConfig } from '../parsers/infra-config-checker';
import type { PulseConfig } from '../types';

function writeFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJson(filePath: string, value: unknown): void {
  writeFile(filePath, JSON.stringify(value));
}

function makeConfig(rootDir: string): PulseConfig {
  return {
    rootDir,
    backendDir: path.join(rootDir, 'services', 'opaque-api', 'server'),
    frontendDir: path.join(rootDir, 'apps', 'control-panel', 'client'),
    workerDir: path.join(rootDir, 'runners', 'async-jobs', 'worker'),
    schemaPath: path.join(rootDir, 'services', 'opaque-api', 'prisma', 'schema.prisma'),
    globalPrefix: '',
  };
}

describe('infra config checker dynamic evidence', () => {
  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/infra-config-checker.ts',
    );

    expect(findings).toEqual([]);
  });

  it('discovers package and Docker evidence from config roots instead of fixed workspace paths', () => {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-infra-config-'));
    const config = makeConfig(rootDir);

    fs.mkdirSync(config.backendDir, { recursive: true });
    fs.mkdirSync(config.frontendDir, { recursive: true });
    fs.mkdirSync(config.workerDir, { recursive: true });
    writeFile(path.join(rootDir, '.dockerignore'), 'node_modules\n');
    writeFile(path.join(rootDir, 'services', 'opaque-api', 'Dockerfile'), 'FROM node:20\n');
    writeJson(path.join(rootDir, 'services', 'opaque-api', 'package.json'), {
      name: '@local/opaque-api',
      dependencies: { '@opaque/shared': '^2.0.0' },
    });
    writeJson(path.join(rootDir, 'apps', 'control-panel', 'package.json'), {
      name: '@local/control-panel',
      dependencies: { '@opaque/shared': '^3.0.0' },
    });
    writeJson(path.join(rootDir, 'runners', 'async-jobs', 'package.json'), {
      name: '@local/async-jobs',
      dependencies: { bullmq: '^5.0.0' },
    });

    const breaks = checkInfraConfig(config);

    expect(breaks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'DOCKER_NO_MULTISTAGE',
          file: 'services/opaque-api/Dockerfile',
        }),
        expect.objectContaining({
          type: 'PACKAGE_VERSION_CONFLICT',
          file: 'services/opaque-api/package.json',
          description: 'Major version conflict for "@opaque/shared" across packages',
          detail: '@local/opaque-api: ^2.0.0, @local/control-panel: ^3.0.0',
        }),
      ]),
    );
    expect(breaks).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'DOCKER_MISSING_IGNORE' })]),
    );
  });
});
