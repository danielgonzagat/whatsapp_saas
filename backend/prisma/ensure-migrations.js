/**
 * ensure-migrations.js
 *
 * Handles the Prisma P3005 error ("database schema is not empty") that occurs
 * when a production database was originally set up via `prisma db push` and
 * later switched to the `prisma migrate deploy` workflow.
 *
 * On first run: baselines all existing migrations as "already applied",
 * then runs `migrate deploy` for any pending ones.
 * On subsequent runs: `migrate deploy` succeeds immediately.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const cwd = path.join(__dirname, '..');

function runPrisma(args, options = {}) {
  return execFileSync('npx', ['prisma', ...args], { cwd, ...options });
}

// 1. Try migrate deploy — fast path for normal deploys
try {
  runPrisma(['migrate', 'deploy'], { stdio: 'pipe' });
  console.log('[ensure-migrations] Migrations applied successfully');
  process.exit(0);
} catch (e) {
  const output = (e.stderr || '').toString() + (e.stdout || '').toString();
  if (!output.includes('P3005')) {
    // Unknown error — propagate
    console.error(output);
    process.exit(1);
  }
}

// 2. P3005: database was created via db push — needs baselining
console.log(
  '[ensure-migrations] Baselining database (P3005 — schema not empty, no migration history)...',
);

const migrationsDir = path.join(__dirname, 'migrations');
const migrations = fs
  .readdirSync(migrationsDir)
  .filter((f) => /^\d{14}/.test(f))
  .sort();

console.log(`[ensure-migrations] Found ${migrations.length} migrations to resolve`);

for (const migration of migrations) {
  console.log(`  Resolving: ${migration}`);
  try {
    runPrisma(['migrate', 'resolve', '--applied', migration], { stdio: 'pipe' });
  } catch {
    // Already resolved — safe to ignore
  }
}

// 3. Run migrate deploy after baseline (applies any new migrations)
console.log('[ensure-migrations] Running migrate deploy after baseline...');
try {
  runPrisma(['migrate', 'deploy'], { stdio: 'inherit' });
  console.log('[ensure-migrations] Baseline + deploy complete');
} catch (e) {
  console.error('[ensure-migrations] migrate deploy failed after baseline');
  process.exit(1);
}
