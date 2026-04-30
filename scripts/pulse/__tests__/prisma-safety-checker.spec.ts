import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkPrismaSafety } from '../parsers/prisma-safety-checker';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-prisma-safety-'));
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

describe('Prisma safety checker dynamic evidence', () => {
  it('requires pagination for Prisma models discovered from schema evidence', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/prisma/schema.prisma',
      `
      model OpaqueEvent {
        id String @id
        createdAt DateTime
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/opaque-event.service.ts',
      `
      export class OpaqueEventService {
        list() {
          return this.prisma.opaqueEvent.findMany({
            orderBy: { createdAt: 'desc' },
          });
        }
      }
      `,
    );

    expect(checkPrismaSafety(config)).toContainEqual(
      expect.objectContaining({
        type: 'FINDMANY_NO_PAGINATION',
        file: 'backend/src/opaque-event.service.ts',
      }),
    );
  });

  it('requires transactions for schema-derived atomic write surfaces outside named product paths', () => {
    const config = makeConfig();
    writeFile(
      config.rootDir,
      'backend/prisma/schema.prisma',
      `
      model OpaqueLedger {
        id String @id
        amount Decimal
        createdAt DateTime
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/neutral/writer.service.ts',
      `
      export class NeutralWriterService {
        async writeTwice() {
          await this.prisma.opaqueLedger.create({ data: { amount: 1 } });
          return this.prisma.opaqueLedger.update({ where: { id: 'id' }, data: { amount: 2 } });
        }
      }
      `,
    );

    expect(checkPrismaSafety(config)).toContainEqual(
      expect.objectContaining({
        type: 'FINANCIAL_NO_TRANSACTION',
        file: 'backend/src/neutral/writer.service.ts',
      }),
    );
  });

  it('keeps the Prisma safety checker free of hardcoded reality authority findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const prismaSafetyFindings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/prisma-safety-checker.ts',
    );

    expect(prismaSafetyFindings).toEqual([]);
  });
});
