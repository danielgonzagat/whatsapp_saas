import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkDataIntegrity } from '../parsers/data-integrity';
import { dbQuery } from '../parsers/runtime-utils';
import type { PulseConfig } from '../types';

vi.mock('../parsers/runtime-utils', () => ({
  dbQuery: vi.fn(),
}));

const mockedDbQuery = vi.mocked(dbQuery);

function makeConfig(schema: string): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-data-integrity-'));
  const schemaPath = path.join(rootDir, 'backend/prisma/schema.prisma');
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
  fs.writeFileSync(schemaPath, schema, 'utf8');

  return {
    rootDir,
    backendDir: path.join(rootDir, 'backend/src'),
    frontendDir: path.join(rootDir, 'frontend/src'),
    workerDir: path.join(rootDir, 'worker'),
    schemaPath,
    globalPrefix: '',
  };
}

async function withDeepEnv<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.PULSE_DEEP;
  process.env.PULSE_DEEP = '1';
  try {
    return await run();
  } finally {
    if (previous === undefined) {
      delete process.env.PULSE_DEEP;
    } else {
      process.env.PULSE_DEEP = previous;
    }
  }
}

describe('checkDataIntegrity', () => {
  beforeEach(() => {
    mockedDbQuery.mockReset();
  });

  it('derives blocking orphan checks from Prisma relations instead of fixed product SQL', async () => {
    const config = makeConfig(`
      model Parent {
        id String @id
        children Child[]
        @@map("parents")
      }

      model Child {
        id String @id
        parentId String @map("parent_id")
        parent Parent @relation(fields: [parentId], references: [id])
        @@map("children")
      }
    `);
    mockedDbQuery.mockResolvedValueOnce([{ cnt: '2' }]);

    const breaks = await withDeepEnv(() => checkDataIntegrity(config));

    expect(mockedDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM "children" child'),
      [],
    );
    expect(mockedDbQuery).toHaveBeenCalledWith(
      expect.not.stringMatching(/Product|Plan|Order|Workspace|User/),
      [],
    );
    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'DATA_RELATION_ORPHANED_RECORD',
        severity: 'high',
        source: 'schema-derived:prisma-relation',
        description: '2 row(s) violate Prisma relation Child.parent',
      }),
    ]);
  });

  it('reports discovered negative balance fields as weak non-blocking signals', async () => {
    const config = makeConfig(`
      model Ledger {
        id String @id
        available Decimal
        @@map("ledger_rows")
      }
    `);
    mockedDbQuery.mockResolvedValueOnce([{ cnt: '1' }]);

    const breaks = await withDeepEnv(() => checkDataIntegrity(config));

    expect(mockedDbQuery).toHaveBeenCalledWith(expect.stringContaining('FROM "ledger_rows"'), []);
    expect(breaks).toEqual([
      expect.objectContaining({
        type: 'DATA_NEGATIVE_NUMERIC_WEAK_SIGNAL',
        severity: 'low',
        source: 'legacy-weak-sensor:data-integrity:needs_schema_owner_review',
      }),
    ]);
  });
});
