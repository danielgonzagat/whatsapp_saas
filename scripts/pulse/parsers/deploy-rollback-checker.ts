/**
 * PULSE Parser 90: Deploy & Rollback Checker
 * Layer 21: Deployment Safety
 * Mode: DEEP (requires codebase scan + CI/CD config access)
 *
 * CHECKS:
 * 1. Rollback possible: deployment can be reverted to previous version within 5 minutes
 *    — checks for Railway rollback config, Docker image tags, or CI rollback step
 * 2. Migration reversibility: every Prisma migration has a `down` migration or the
 *    schema change is backward-compatible (additive only)
 *    — flags DROP TABLE, DROP COLUMN, ALTER COLUMN (type change), NOT NULL on existing column
 * 3. Canary / feature flags: deployment of risky features uses feature flags
 *    — checks for feature flag evidence in source
 * 4. Zero-downtime deployment: checks for graceful shutdown handling (SIGTERM)
 *    and connection draining before process exit
 * 5. Migration run order: migrations are applied before code deployment (not after)
 *    — checks CI/CD pipeline order
 * 6. Database backup before migration: CI pipeline runs backup before applying migrations
 *
 * REQUIRES: PULSE_DEEP=1, CI/CD config accessible
 * DIAGNOSTICS:
 *   Emits static weak signals with predicate metadata. Static matches are
 *   probe evidence, not authority by themselves.
 */
import { safeJoin } from '../safe-path';
import * as path from 'path';
import { isDirectory, pathExists, readTextFile } from '../safe-fs';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

type DeployRollbackTruthMode = 'weak_signal' | 'confirmed_static';

type DeployRollbackDiagnosticBreak = Break & {
  truthMode: DeployRollbackTruthMode;
};

interface DeployRollbackDiagnosticInput {
  predicateKinds: string[];
  severity: Break['severity'];
  file: string;
  line: number;
  description: string;
  detail: string;
  truthMode: DeployRollbackTruthMode;
}

function buildDeployRollbackDiagnostic(
  input: DeployRollbackDiagnosticInput,
): DeployRollbackDiagnosticBreak {
  const predicateToken = input.predicateKinds
    .map((predicate) => predicate.replace(/[^a-z0-9]+/gi, '-').toLowerCase())
    .filter(Boolean)
    .join('+');

  return {
    type: `diagnostic:deploy-rollback-checker:${predicateToken || 'deployment-safety-observation'}`,
    severity: input.severity,
    file: input.file,
    line: input.line,
    description: input.description,
    detail: input.detail,
    source: `static-heuristic:deploy-rollback-checker;truthMode=${input.truthMode};predicates=${input.predicateKinds.join(',')}`,
    truthMode: input.truthMode,
  };
}

function appendDeployRollbackDiagnostic(
  target: Break[],
  input: DeployRollbackDiagnosticInput,
): void {
  target.push(buildDeployRollbackDiagnostic(input));
}

function stripSqlComments(content: string): string {
  let output = '';
  let index = 0;
  while (index < content.length) {
    const current = content[index];
    const next = content[index + 1];
    if (current === '-' && next === '-') {
      index += 2;
      while (index < content.length && content[index] !== '\n') {
        index += 1;
      }
      continue;
    }
    if (current === '/' && next === '*') {
      index += 2;
      while (index < content.length) {
        if (content[index] === '*' && content[index + 1] === '/') {
          index += 2;
          break;
        }
        index += 1;
      }
      continue;
    }
    output += current;
    index += 1;
  }
  return output;
}

function splitSqlStatements(content: string): string[] {
  return stripSqlComments(content)
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function isAdditiveAlterStatement(statement: string): boolean {
  const tokens = sqlTokens(statement);
  return (
    hasSqlSequence(tokens, ['ALTER', 'TABLE']) &&
    hasAnySqlSequence(tokens, [
      ['ADD', 'COLUMN'],
      ['ADD', 'CONSTRAINT'],
    ])
  );
}

function sqlTokens(statement: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (const char of statement) {
    const code = char.charCodeAt(0);
    const isLetter = (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
    const isDigit = code >= 48 && code <= 57;
    const isUnderscore = char === '_';
    if (isLetter || isDigit || isUnderscore) {
      current += char.toUpperCase();
      continue;
    }
    if (current.length > 0) {
      tokens.push(current);
      current = '';
    }
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function hasSqlSequence(tokens: string[], sequence: string[]): boolean {
  if (sequence.length === 0 || sequence.length > tokens.length) {
    return false;
  }
  return tokens.some((_, startIndex) =>
    sequence.every((token, offset) => tokens[startIndex + offset] === token),
  );
}

function hasAnySqlSequence(tokens: string[], sequences: string[][]): boolean {
  return sequences.some((sequence) => hasSqlSequence(tokens, sequence));
}

function isDestructiveMigrationStatement(statement: string): boolean {
  const tokens = sqlTokens(statement);
  if (hasSqlSequence(tokens, ['TRUNCATE'])) {
    return true;
  }
  if (
    hasAnySqlSequence(tokens, [
      ['DROP', 'TABLE'],
      ['DROP', 'COLUMN'],
      ['DROP', 'TYPE'],
      ['DROP', 'INDEX'],
    ])
  ) {
    return true;
  }
  return (
    hasSqlSequence(tokens, ['ALTER', 'TABLE']) &&
    hasSqlSequence(tokens, ['ALTER', 'COLUMN']) &&
    hasAnySqlSequence(tokens, [
      ['TYPE'],
      ['SET', 'DATA', 'TYPE'],
      ['SET', 'NOT', 'NULL'],
      ['DROP', 'DEFAULT'],
    ])
  );
}

function isDestructiveMigration(content: string): boolean {
  return splitSqlStatements(content).some((statement) => {
    if (isAdditiveAlterStatement(statement)) {
      return false;
    }
    return isDestructiveMigrationStatement(statement);
  });
}

function hasRollbackEvidence(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes('rollback') ||
    normalized.includes('revert') ||
    (normalized.includes('previous') && normalized.includes('deploy')) ||
    (normalized.includes('image') && normalized.includes('tag'))
  );
}

function hasFeatureFlagEvidence(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    (normalized.includes('feature') && normalized.includes('flag')) || content.includes('FEATURE_')
  );
}

function hasGracefulShutdownEvidence(content: string): boolean {
  return (
    content.includes('SIGTERM') ||
    content.includes('enableShutdownHooks') ||
    content.includes('beforeApplicationShutdown') ||
    content.includes('onApplicationShutdown')
  );
}

function hasPrismaMigrationEvidence(content: string): boolean {
  const normalized = content.toLowerCase();
  return normalized.includes('prisma') && normalized.includes('migrate');
}

function hasBackupEvidence(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes('backup') || normalized.includes('dump') || normalized.includes('pg_dump')
  );
}

/** Check deploy rollback. */
export function checkDeployRollback(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // CHECK 1: Rollback mechanism exists
  const rollbackIndicators = [
    safeJoin(config.rootDir, '.github', 'workflows'),
    safeJoin(config.rootDir, 'railway.json'),
    safeJoin(config.rootDir, 'Dockerfile'),
    safeJoin(config.rootDir, 'docker-compose.yml'),
  ];

  let hasRollbackConfig = false;
  for (const loc of rollbackIndicators) {
    if (!pathExists(loc)) {
      continue;
    }
    const isDir = isDirectory(loc);
    if (isDir) {
      const files = walkFiles(loc, ['.yml', '.yaml', '.json']);
      for (const f of files) {
        try {
          const content = readTextFile(f);
          if (hasRollbackEvidence(content)) {
            hasRollbackConfig = true;
            break;
          }
        } catch {
          continue;
        }
      }
    } else {
      try {
        const content = readTextFile(loc);
        if (hasRollbackEvidence(content)) {
          hasRollbackConfig = true;
        }
      } catch {
        continue;
      }
    }
    if (hasRollbackConfig) {
      break;
    }
  }

  if (!hasRollbackConfig) {
    appendDeployRollbackDiagnostic(breaks, {
      predicateKinds: ['rollback_mechanism', 'not_observed'],
      severity: 'high',
      file: '.github/workflows/',
      line: 0,
      description:
        'No deployment rollback mechanism configured — bad deploy cannot be reverted quickly',
      detail:
        'Configure rollback or image versioning with a CI step to revert to previous image tag',
      truthMode: 'weak_signal',
    });
  }

  // CHECK 2: Migration reversibility
  const migrationsDir = safeJoin(config.rootDir, 'backend', 'prisma', 'migrations');
  const altMigrationsDir = safeJoin(config.rootDir, 'prisma', 'migrations');
  const migDir = pathExists(migrationsDir) ? migrationsDir : altMigrationsDir;

  if (pathExists(migDir)) {
    const migrationFiles = walkFiles(migDir, ['.sql']);
    for (const migFile of migrationFiles) {
      let content: string;
      try {
        content = readTextFile(migFile);
      } catch {
        continue;
      }
      const relFile = path.relative(config.rootDir, migFile);

      if (isDestructiveMigration(content)) {
        // Check if there's a corresponding down migration
        const downFile = migFile.replace(/\.sql$/, '.down.sql');
        const hasDownMigration = pathExists(downFile);

        if (!hasDownMigration) {
          // Check if the migration is in a folder with a down.sql
          const migDir2 = path.dirname(migFile);
          const hasDownInDir =
            pathExists(safeJoin(migDir2, 'down.sql')) ||
            pathExists(safeJoin(migDir2, 'migration.down.sql'));

          if (!hasDownInDir) {
            appendDeployRollbackDiagnostic(breaks, {
              predicateKinds: ['destructive_migration', 'down_migration_not_observed'],
              severity: 'high',
              file: relFile,
              line: 0,
              description:
                'Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback',
              detail: `Detected destructive SQL in ${path.basename(migFile)}; create a .down.sql that reverses these changes`,
              truthMode: 'weak_signal',
            });
          }
        }
      }
    }
  }

  // CHECK 3: Feature flags
  const allFiles = [
    ...walkFiles(config.backendDir, ['.ts']),
    ...walkFiles(config.frontendDir, ['.ts', '.tsx']),
  ];

  let hasFeatureFlags = false;
  for (const file of allFiles) {
    if (/node_modules|\.next/.test(file)) {
      continue;
    }
    let content: string;
    try {
      content = readTextFile(file);
    } catch {
      continue;
    }
    if (hasFeatureFlagEvidence(content)) {
      hasFeatureFlags = true;
      break;
    }
  }

  if (!hasFeatureFlags) {
    appendDeployRollbackDiagnostic(breaks, {
      predicateKinds: ['feature_flag_system', 'not_observed'],
      severity: 'medium',
      file: 'backend/src/',
      line: 0,
      description:
        'No feature flag system detected — risky features deployed to all users simultaneously',
      detail: 'Implement feature flag evidence for gradual rollout before deploying risky changes',
      truthMode: 'weak_signal',
    });
  }

  // CHECK 4: Graceful shutdown (SIGTERM handling)
  const mainFiles = [
    safeJoin(config.backendDir, 'src', 'main.ts'),
    safeJoin(config.workerDir, 'src', 'main.ts'),
  ];

  for (const mainFile of mainFiles) {
    if (!pathExists(mainFile)) {
      continue;
    }
    let content: string;
    try {
      content = readTextFile(mainFile);
    } catch {
      continue;
    }
    const relFile = path.relative(config.rootDir, mainFile);

    if (!hasGracefulShutdownEvidence(content)) {
      appendDeployRollbackDiagnostic(breaks, {
        predicateKinds: ['graceful_shutdown', 'sigterm_handler_not_observed'],
        severity: 'high',
        file: relFile,
        line: 0,
        description:
          'No graceful shutdown (SIGTERM) handling — in-flight requests may be interrupted on deploy',
        detail:
          'Add app.enableShutdownHooks() in main.ts and implement OnApplicationShutdown in critical services',
        truthMode: 'weak_signal',
      });
    }
  }

  // CHECK 6: Backup before migration in CI
  const ciDir = safeJoin(config.rootDir, '.github', 'workflows');
  if (pathExists(ciDir)) {
    const ciFiles = walkFiles(ciDir, ['.yml', '.yaml']);
    let hasMigrationBackup = false;
    for (const ciFile of ciFiles) {
      let content: string;
      try {
        content = readTextFile(ciFile);
      } catch {
        continue;
      }
      if (hasPrismaMigrationEvidence(content) && hasBackupEvidence(content)) {
        hasMigrationBackup = true;
        break;
      }
    }
    if (!hasMigrationBackup) {
      const hasMigrationInCI = ciFiles.some((f) => {
        try {
          return hasPrismaMigrationEvidence(readTextFile(f));
        } catch {
          return false;
        }
      });
      if (hasMigrationInCI) {
        appendDeployRollbackDiagnostic(breaks, {
          predicateKinds: ['ci_migration', 'backup_step_not_observed'],
          severity: 'high',
          file: '.github/workflows/',
          line: 0,
          description: 'CI runs Prisma migrations without taking a DB backup first',
          detail:
            'Add a database backup step before migration deploy in CI/CD to enable point-in-time restore if migration fails',
          truthMode: 'weak_signal',
        });
      }
    }
  }

  // TODO: Implement when infrastructure available
  // - Test actual Railway rollback execution time
  // - Verify migrations are applied before code in deployment order
  // - Blue/green deployment validation

  return breaks;
}
