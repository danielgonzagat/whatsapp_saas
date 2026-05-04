import { describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkSchemaDrift } from '../parsers/schema-drift';
import { dbQuery } from '../parsers/runtime-utils';
import type { PulseConfig } from '../types';

vi.mock('../parsers/runtime-utils', () => ({
  dbQuery: vi.fn(),
  isDeepMode: () => true,
}));

const mockedDbQuery = vi.mocked(dbQuery);

function makeConfig(schema: string): PulseConfig {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-schema-drift-'));
  const backendDir = path.join(rootDir, 'backend', 'src');
  const frontendDir = path.join(rootDir, 'frontend', 'src');
  const workerDir = path.join(rootDir, 'worker');
  const schemaPath = path.join(rootDir, 'backend', 'prisma', 'schema.prisma');

  fs.mkdirSync(backendDir, { recursive: true });
  fs.mkdirSync(frontendDir, { recursive: true });
  fs.mkdirSync(workerDir, { recursive: true });
  fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
  fs.writeFileSync(schemaPath, schema, 'utf8');

  return { rootDir, backendDir, frontendDir, workerDir, schemaPath, globalPrefix: '' };
}

describe('schema drift diagnostics', () => {
  it('keeps the schema drift parser free of hardcoded reality authority findings', () => {
    const result = auditPulseNoHardcodedReality(process.cwd());
    const findings = result.findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/schema-drift.ts',
    );

    expect(findings).toEqual([]);
  });

  it('emits generated diagnostics from schema and DB catalog predicates', async () => {
    const config = makeConfig(`
      model Account {
        id String @id
        @@map("accounts")
      }

      model LedgerEntry {
        id String @id
      }
    `);

    mockedDbQuery
      .mockResolvedValueOnce([{ table_name: 'accounts' }])
      .mockResolvedValueOnce([
        { migration_name: '20260430120000_add_ledger', started_at: new Date().toISOString() },
      ]);

    const findings = await checkSchemaDrift(config);

    expect(findings).toEqual([
      expect.objectContaining({
        type: 'diagnostic:schema-drift:schema-model-observed+database-table-not-observed',
        source: expect.stringContaining(
          'predicates=schema_model_observed,database_table_not_observed',
        ),
        surface: 'schema-drift',
      }),
      expect.objectContaining({
        type: 'diagnostic:schema-drift:migration-record-observed+migration-completion-not-observed',
        source: expect.stringContaining(
          'predicates=migration_record_observed,migration_completion_not_observed',
        ),
        surface: 'schema-drift',
      }),
    ]);
  });
});
