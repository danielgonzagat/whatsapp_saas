import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkE2eWithdrawal } from '../parsers/e2e-withdrawal';
import { dbQuery } from '../parsers/runtime-utils';
import type { PulseConfig } from '../types';

vi.mock('../parsers/runtime-utils', () => ({
  dbQuery: vi.fn(),
}));

const mockedDbQuery = vi.mocked(dbQuery);

function makeConfig(schema: string): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-e2e-withdrawal-'));
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

describe('checkE2eWithdrawal schema-derived probes', () => {
  beforeEach(() => {
    mockedDbQuery.mockReset();
  });

  it('builds numeric probes from the observed schema instead of fixed product SQL', async () => {
    const config = makeConfig(`
      model OpaqueLedger {
        id String @id
        available Decimal
        @@map("opaque_ledger_rows")
      }
    `);
    mockedDbQuery.mockResolvedValueOnce([{ cnt: '1' }]);

    const findings = await withDeepEnv(() => checkE2eWithdrawal(config));

    expect(mockedDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM "opaque_ledger_rows"'),
      [],
    );
    expect(mockedDbQuery).toHaveBeenCalledWith(expect.not.stringMatching(/Kloel|Withdrawal/), []);
    expect(findings).toEqual([
      expect.objectContaining({
        type: expect.stringMatching(/^diagnostic:/),
        source: expect.stringContaining('schema-derived:numeric-runtime-probe'),
        surface: 'schema-derived-numeric-consistency',
      }),
    ]);
  });
});
