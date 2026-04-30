import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkSensitiveData } from '../parsers/sensitive-data-checker';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-sensitive-data-'));
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

describe('sensitive data checker dynamic evidence', () => {
  it('reports credential-shaped runtime data without flagging static log labels', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/src/opaque.service.ts',
      `
      import { HttpException } from '@nestjs/common';

      export class OpaqueService {
        private readonly logger = console;

        submit(accessToken: string, error: Error) {
          this.logger.log('Password updated');
          this.logger.error({ accessToken });
          throw new HttpException(error.message, 500);
        }
      }
      `,
    );

    const breaks = checkSensitiveData(config);

    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'SENSITIVE_DATA_IN_LOG',
        severity: 'critical',
        file: 'backend/src/opaque.service.ts',
        line: 9,
      }),
      expect.objectContaining({
        type: 'INTERNAL_ERROR_EXPOSED',
        severity: 'high',
        file: 'backend/src/opaque.service.ts',
        line: 10,
      }),
    ]);
  });

  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const findings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/sensitive-data-checker.ts',
    );

    expect(findings).toEqual([]);
  });
});
