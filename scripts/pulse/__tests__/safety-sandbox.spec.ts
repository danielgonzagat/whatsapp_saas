import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  classifyDestructiveActions,
  getAllIsolationRules,
  getIsolationRules,
} from '../safety-sandbox';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-safety-sandbox-'));
  tempRoots.push(rootDir);
  return rootDir;
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const targetPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
}

afterEach(() => {
  while (tempRoots.length > 0) {
    const rootDir = tempRoots.pop();
    if (rootDir) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  }
});

describe('safety sandbox effect graph', () => {
  it('derives protected governance risk from the file effect graph', () => {
    const rootDir = makeTempRoot();
    writeFile(
      rootDir,
      'ops/protected-governance-files.json',
      JSON.stringify({
        protectedExact: ['CUSTOM_LOCK.md'],
        protectedPrefixes: [],
      }),
    );
    writeFile(rootDir, 'CUSTOM_LOCK.md', '# lock\n');

    const actions = classifyDestructiveActions(rootDir);
    const protectedAction = actions.find(
      (action) => action.kind === 'protected_file_edit' && action.targetFile === 'CUSTOM_LOCK.md',
    );

    expect(protectedAction).toEqual(
      expect.objectContaining({
        riskLevel: 'critical',
        requiresGovernedSandbox: true,
        requiresRollbackProof: true,
      }),
    );
  });

  it('uses reversibility evidence to lower a migration from critical to high', () => {
    const rootDir = makeTempRoot();
    writeFile(
      rootDir,
      'backend/prisma/migrations/20260429_add_index/migration.sql',
      [
        'CREATE INDEX CONCURRENTLY user_email_idx ON "User" ("email");',
        '-- rollback: DROP INDEX user_email_idx;',
      ].join('\n'),
    );

    const migration = classifyDestructiveActions(rootDir).find(
      (action) => action.kind === 'migration',
    );

    expect(migration).toEqual(
      expect.objectContaining({
        riskLevel: 'high',
        requiresGovernedSandbox: true,
        requiresRollbackProof: true,
      }),
    );
  });

  it('keeps irreversible destructive SQL critical when rollback evidence is absent', () => {
    const rootDir = makeTempRoot();
    writeFile(
      rootDir,
      'backend/prisma/migrations/20260429_drop_column/migration.sql',
      'ALTER TABLE "Order" DROP COLUMN "legacyTotal";\n',
    );

    const migration = classifyDestructiveActions(rootDir).find(
      (action) => action.kind === 'migration',
    );

    expect(migration).toEqual(
      expect.objectContaining({
        riskLevel: 'critical',
        requiresBackup: true,
        requiresRollbackProof: true,
      }),
    );
  });

  it('derives sandbox validation commands from the command graph when available', () => {
    const rootDir = makeTempRoot();
    writeFile(
      rootDir,
      'package.json',
      JSON.stringify({
        scripts: {
          lint: 'eslint .',
          typecheck: 'tsc --noEmit',
          test: 'vitest run',
          build: 'tsc -p tsconfig.json',
        },
      }),
    );
    writeFile(rootDir, 'tsconfig.json', JSON.stringify({ compilerOptions: {} }));

    const infraRules = getIsolationRules('infra_change', rootDir);
    const allRules = getAllIsolationRules(rootDir);

    expect(infraRules.preValidationCommands).toEqual(
      expect.arrayContaining(['npm run lint', 'npm run typecheck']),
    );
    expect(infraRules.postValidationCommands).toEqual(
      expect.arrayContaining(['npm run build', 'npm run test']),
    );
    expect(allRules.find((rule) => rule.kind === 'infra_change')).toEqual(infraRules);
  });
});
