import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { auditPulseNoHardcodedReality } from '../no-hardcoded-reality-audit';
import { checkDeployRollback } from '../parsers/deploy-rollback-checker';
import type { PulseConfig } from '../types';

const tempRoots: string[] = [];

function makeTempRoot(): string {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-deploy-rollback-'));
  tempRoots.push(rootDir);
  return rootDir;
}

function pulseConfig(rootDir: string): PulseConfig {
  return {
    rootDir,
    frontendDir: path.join(rootDir, 'frontend'),
    backendDir: path.join(rootDir, 'backend'),
    workerDir: path.join(rootDir, 'worker'),
    schemaPath: path.join(rootDir, 'backend/prisma/schema.prisma'),
    globalPrefix: '',
  };
}

function writeFile(rootDir: string, relativePath: string, content: string): void {
  const file = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, 'utf8');
}

describe('deploy rollback checker parser', () => {
  afterEach(() => {
    for (const rootDir of tempRoots.splice(0)) {
      fs.rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('keeps the parser source free of hardcoded reality authority findings', () => {
    const findings = auditPulseNoHardcodedReality(process.cwd()).findings.filter(
      (finding) => finding.filePath === 'scripts/pulse/parsers/deploy-rollback-checker.ts',
    );

    expect(findings).toEqual([]);
  });

  it('emits generated diagnostics from missing deployment safety predicates', () => {
    const rootDir = makeTempRoot();
    writeFile(
      rootDir,
      '.github/workflows/deploy.yml',
      [
        'name: deploy',
        'jobs:',
        '  deploy:',
        '    steps:',
        '      - run: prisma migrate deploy',
      ].join('\n'),
    );
    writeFile(rootDir, 'backend/src/main.ts', 'async function bootstrap() { return null; }');
    writeFile(rootDir, 'backend/src/orders.service.ts', 'export class OrdersService {}');
    writeFile(
      rootDir,
      'frontend/src/app/page.tsx',
      'export default function Page() { return null; }',
    );
    writeFile(
      rootDir,
      'backend/prisma/migrations/20260430000000_drop_users/migration.sql',
      ['-- DROP TABLE ignored_comment;', 'DROP TABLE users;'].join('\n'),
    );

    const breaks = checkDeployRollback(pulseConfig(rootDir));

    expect(breaks.map((item) => item.type).sort()).toEqual([
      'diagnostic:deploy-rollback-checker:ci-migration+backup-step-not-observed',
      'diagnostic:deploy-rollback-checker:destructive-migration+down-migration-not-observed',
      'diagnostic:deploy-rollback-checker:feature-flag-system+not-observed',
      'diagnostic:deploy-rollback-checker:graceful-shutdown+sigterm-handler-not-observed',
      'diagnostic:deploy-rollback-checker:rollback-mechanism+not-observed',
    ]);
    expect(breaks.every((item) => item.source?.includes('predicates='))).toBe(true);
  });

  it('does not emit diagnostics when observed predicates are present', () => {
    const rootDir = makeTempRoot();
    writeFile(
      rootDir,
      '.github/workflows/deploy.yml',
      [
        'name: deploy',
        'jobs:',
        '  deploy:',
        '    steps:',
        '      - run: pg_dump "$DATABASE_URL" > backup.sql',
        '      - run: prisma migrate deploy',
        '      - run: rollback to previous deploy on failure',
      ].join('\n'),
    );
    writeFile(
      rootDir,
      'backend/src/main.ts',
      [
        'async function bootstrap(app: { enableShutdownHooks(): void }) {',
        '  app.enableShutdownHooks();',
        '}',
      ].join('\n'),
    );
    writeFile(
      rootDir,
      'backend/src/flags.ts',
      'export const FEATURE_SAFE_ROLLOUT = process.env.FEATURE_SAFE_ROLLOUT;',
    );
    writeFile(
      rootDir,
      'backend/prisma/migrations/20260430000000_drop_users/migration.sql',
      'DROP TABLE users;',
    );
    writeFile(
      rootDir,
      'backend/prisma/migrations/20260430000000_drop_users/down.sql',
      'CREATE TABLE users (id TEXT PRIMARY KEY);',
    );

    expect(checkDeployRollback(pulseConfig(rootDir))).toEqual([]);
  });
});
