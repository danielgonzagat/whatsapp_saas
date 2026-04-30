import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { checkE2ePayment } from '../parsers/e2e-payment';
import { dbQuery } from '../parsers/runtime-utils';
import type { PulseConfig } from '../types';

vi.mock('../parsers/runtime-utils', () => ({
  dbQuery: vi.fn(),
}));

const mockedDbQuery = vi.mocked(dbQuery);

function makeConfig(schema: string): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-e2e-payment-'));
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

describe('checkE2ePayment schema-derived probes', () => {
  beforeEach(() => {
    mockedDbQuery.mockReset();
  });

  it('derives runtime SQL from schema instead of fixed payment tables/providers', async () => {
    const config = makeConfig(`
      model OpaqueSettlement {
        id String @id
        total Decimal
        @@map("opaque_settlement_rows")
      }
    `);
    mockedDbQuery.mockResolvedValueOnce([{ cnt: '1' }]);

    const findings = await withDeepEnv(() => checkE2ePayment(config));

    expect(mockedDbQuery).toHaveBeenCalledWith(
      expect.stringContaining('FROM "opaque_settlement_rows"'),
      [],
    );
    expect(mockedDbQuery).toHaveBeenCalledWith(
      expect.not.stringMatching(/CheckoutOrder|Kloel|WebhookEvent|stripe/i),
      [],
    );
    expect(findings).toEqual([
      expect.objectContaining({
        type: expect.stringMatching(/^diagnostic:/),
        source: expect.stringContaining('schema-derived:e2e-payment-runtime-probe'),
        surface: 'schema-derived-payment-consistency',
      }),
    ]);
  });
});
