import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { checkEdgeCases } from '../parsers/edge-case-tester';
import type { PulseConfig } from '../types';

function makeConfig(): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-edge-case-tester-'));
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
  const target = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

describe('edge case tester input-shape synthesis', () => {
  it('reports weak input-shape boundary evidence with visible names from observed code', () => {
    const config = makeConfig();

    writeFile(
      config.rootDir,
      'backend/src/opaque.dto.ts',
      `
      import { IsInt, IsString } from 'class-validator';

      export class OpaqueDto {
        @IsString()
        displayName!: string;

        @IsInt()
        retryCount!: number;
      }
      `,
    );
    writeFile(
      config.rootDir,
      'backend/src/opaque.service.ts',
      `
      export function list(limit: string) {
        const take = Number(limit);
        return take;
      }
      `,
    );

    const breaks = checkEdgeCases(config);
    const serialized = JSON.stringify(breaks);

    expect(breaks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: expect.stringContaining('"displayName"'),
          source: 'input-shape-boundary-synthesis:weak-regex',
          surface: 'decorated scalar input',
        }),
        expect.objectContaining({
          description: expect.stringContaining('"retryCount"'),
          source: 'input-shape-boundary-synthesis:weak-regex',
          surface: 'decorated scalar input',
        }),
        expect.objectContaining({
          description: expect.stringContaining('"limit"'),
          source: 'input-shape-boundary-synthesis:weak-regex',
          surface: 'numeric request cursor',
        }),
      ]),
    );
    expect(serialized).toContain('rawWeakEvidence=');
    expect(serialized).not.toMatch(/String edge case|Number edge case|Pagination parameter/);
  });

  it('does not treat fixed edge-case category words in file names as authority', () => {
    const config = makeConfig();

    writeFile(
      config.rootDir,
      'backend/src/date-string-number-file-array-pagination.service.ts',
      `
      export class CategoryNameOnlyService {
        stable() {
          return 'category names are not input-shape evidence';
        }
      }
      `,
    );

    expect(checkEdgeCases(config)).toEqual([]);
  });
});
