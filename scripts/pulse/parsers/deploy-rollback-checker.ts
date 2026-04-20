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
 *    — checks for LaunchDarkly, Unleash, or custom feature flag system
 * 4. Zero-downtime deployment: checks for graceful shutdown handling (SIGTERM)
 *    and connection draining before process exit
 * 5. Migration run order: migrations are applied before code deployment (not after)
 *    — checks CI/CD pipeline order
 * 6. Database backup before migration: CI pipeline runs backup before applying migrations
 *
 * REQUIRES: PULSE_DEEP=1, CI/CD config accessible
 * BREAK TYPES:
 *   DEPLOY_NO_ROLLBACK(high)        — deployment cannot be quickly rolled back
 *   MIGRATION_NO_ROLLBACK(high)     — destructive migration with no down migration
 *   DEPLOY_NO_FEATURE_FLAGS(medium) — risky features deployed without feature flags
 */
import * as fs from 'fs';
import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';

// Destructive migration operations
const DESTRUCTIVE_MIGRATION_RE =
  /DROP\s+TABLE|DROP\s+COLUMN|ALTER\s+COLUMN|TRUNCATE|NOT NULL|DROP\s+INDEX/i;
// Additive-only (safe) patterns
const ADDITIVE_ONLY_RE = /CREATE\s+TABLE|ADD\s+COLUMN|CREATE\s+INDEX/i;

/** Check deploy rollback. */
export function checkDeployRollback(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // CHECK 1: Rollback mechanism exists
  const rollbackIndicators = [
    path.join(config.rootDir, '.github', 'workflows'),
    path.join(config.rootDir, 'railway.json'),
    path.join(config.rootDir, 'Dockerfile'),
    path.join(config.rootDir, 'docker-compose.yml'),
  ];

  let hasRollbackConfig = false;
  for (const loc of rollbackIndicators) {
    if (!fs.existsSync(loc)) {
      continue;
    }
    const isDir = fs.statSync(loc).isDirectory();
    if (isDir) {
      const files = walkFiles(loc, ['.yml', '.yaml', '.json']);
      for (const f of files) {
        try {
          const content = fs.readFileSync(f, 'utf8');
          if (/rollback|revert|previous.*deploy|deploy.*previous|image.*tag/i.test(content)) {
            hasRollbackConfig = true;
            break;
          }
        } catch {
          continue;
        }
      }
    } else {
      try {
        const content = fs.readFileSync(loc, 'utf8');
        if (/rollback|revert|previousDeploy|imageTag/i.test(content)) {
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
    breaks.push({
      type: 'DEPLOY_NO_ROLLBACK',
      severity: 'high',
      file: '.github/workflows/',
      line: 0,
      description:
        'No deployment rollback mechanism configured — bad deploy cannot be reverted quickly',
      detail:
        'Configure Railway instant rollback or Docker image versioning with a CI step to revert to previous image tag',
    });
  }

  // CHECK 2: Migration reversibility
  const migrationsDir = path.join(config.rootDir, 'backend', 'prisma', 'migrations');
  const altMigrationsDir = path.join(config.rootDir, 'prisma', 'migrations');
  const migDir = fs.existsSync(migrationsDir) ? migrationsDir : altMigrationsDir;

  if (fs.existsSync(migDir)) {
    const migrationFiles = walkFiles(migDir, ['.sql']);
    for (const migFile of migrationFiles) {
      let content: string;
      try {
        content = fs.readFileSync(migFile, 'utf8');
      } catch {
        continue;
      }
      const relFile = path.relative(config.rootDir, migFile);

      if (DESTRUCTIVE_MIGRATION_RE.test(content)) {
        // Check if there's a corresponding down migration
        const downFile = migFile.replace(/\.sql$/, '.down.sql');
        const hasDownMigration = fs.existsSync(downFile);

        if (!hasDownMigration) {
          // Check if the migration is in a folder with a down.sql
          const migDir2 = path.dirname(migFile);
          const hasDownInDir =
            fs.existsSync(path.join(migDir2, 'down.sql')) ||
            fs.existsSync(path.join(migDir2, 'migration.down.sql'));

          if (!hasDownInDir) {
            breaks.push({
              type: 'MIGRATION_NO_ROLLBACK',
              severity: 'high',
              file: relFile,
              line: 0,
              description:
                'Destructive migration (DROP/ALTER/NOT NULL) without a down migration — cannot rollback',
              detail: `Detected destructive SQL in ${path.basename(migFile)}; create a .down.sql that reverses these changes`,
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
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (
      /LaunchDarkly|Unleash|flagsmith|featureFlag|isFeatureEnabled|useFeatureFlag|FEATURE_/i.test(
        content,
      )
    ) {
      hasFeatureFlags = true;
      break;
    }
  }

  if (!hasFeatureFlags) {
    breaks.push({
      type: 'DEPLOY_NO_FEATURE_FLAGS',
      severity: 'medium',
      file: 'backend/src/',
      line: 0,
      description:
        'No feature flag system detected — risky features deployed to all users simultaneously',
      detail:
        'Implement feature flags (LaunchDarkly, Unleash, or custom FEATURE_* env vars) for gradual rollout',
    });
  }

  // CHECK 4: Graceful shutdown (SIGTERM handling)
  const mainFiles = [
    path.join(config.backendDir, 'src', 'main.ts'),
    path.join(config.workerDir, 'src', 'main.ts'),
  ];

  for (const mainFile of mainFiles) {
    if (!fs.existsSync(mainFile)) {
      continue;
    }
    let content: string;
    try {
      content = fs.readFileSync(mainFile, 'utf8');
    } catch {
      continue;
    }
    const relFile = path.relative(config.rootDir, mainFile);

    if (
      !/SIGTERM|enableShutdownHooks|beforeApplicationShutdown|onApplicationShutdown/i.test(content)
    ) {
      breaks.push({
        type: 'DEPLOY_NO_ROLLBACK',
        severity: 'high',
        file: relFile,
        line: 0,
        description:
          'No graceful shutdown (SIGTERM) handling — in-flight requests may be interrupted on deploy',
        detail:
          'Add app.enableShutdownHooks() in main.ts and implement OnApplicationShutdown in critical services',
      });
    }
  }

  // CHECK 6: Backup before migration in CI
  const ciDir = path.join(config.rootDir, '.github', 'workflows');
  if (fs.existsSync(ciDir)) {
    const ciFiles = walkFiles(ciDir, ['.yml', '.yaml']);
    let hasMigrationBackup = false;
    for (const ciFile of ciFiles) {
      let content: string;
      try {
        content = fs.readFileSync(ciFile, 'utf8');
      } catch {
        continue;
      }
      if (
        /prisma.*migrate|migrate.*prisma/i.test(content) &&
        /backup|dump|pg_dump/i.test(content)
      ) {
        hasMigrationBackup = true;
        break;
      }
    }
    if (!hasMigrationBackup) {
      const hasMigrationInCI = ciFiles.some((f) => {
        try {
          return /prisma.*migrate|migrate.*prisma/i.test(fs.readFileSync(f, 'utf8'));
        } catch {
          return false;
        }
      });
      if (hasMigrationInCI) {
        breaks.push({
          type: 'MIGRATION_NO_ROLLBACK',
          severity: 'high',
          file: '.github/workflows/',
          line: 0,
          description: 'CI runs Prisma migrations without taking a DB backup first',
          detail:
            'Add a pg_dump step before prisma migrate deploy in CI/CD to enable point-in-time restore if migration fails',
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
