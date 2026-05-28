#!/usr/bin/env node
/**
 * Automated DR drill — exercises the full backup→restore→verify cycle.
 *
 * Steps:
 *   1. Pull the latest backup file path from .backup-manifest.json
 *      OR accept --backup=<path> on the CLI.
 *   2. Spin an ephemeral postgres:16 container via docker.
 *   3. psql -f <backup> into the container.
 *   4. Run `prisma migrate diff` from the schema vs the container — diff must be empty.
 *   5. Run sentinel queries (count workspaces, count workspaces with at least one user).
 *   6. Append a summary line to .dr-test.log with timestamp + restore time + assertions.
 *   7. Update .backup-manifest.json's `lastVerifiedAt` timestamp.
 *   8. docker rm the container.
 *
 * Usage:
 *   node scripts/backup/db-restore-verify.mjs
 *   node scripts/backup/db-restore-verify.mjs --backup=/path/to/dump.sql.gz
 *
 * Exit codes:
 *   0  full pass
 *   1  any assertion failure
 *   2  pre-check failure (docker not available, backup not found, etc.)
 *
 * 10-minute total timeout.
 */
import { execSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const REPO_ROOT = resolve(dirname(__filename), '..', '..');
const MANIFEST = resolve(REPO_ROOT, '.backup-manifest.json');
const DR_LOG = resolve(REPO_ROOT, '.dr-test.log');
const SCHEMA = resolve(REPO_ROOT, 'backend', 'prisma', 'schema.prisma');

const CONTAINER = `kloel-dr-${Date.now()}`;
const PG_PASSWORD = 'kloel-dr-test';
const PG_PORT = 55432;

const args = process.argv.slice(2);
const explicitBackup = args.find((a) => a.startsWith('--backup=')) ?.slice('--backup='.length);

function fail(code, msg) {
  console.error(`[dr-drill] FAIL: ${msg}`);
  cleanup();
  process.exit(code);
}

function ok(msg) {
  console.log(`[dr-drill] ${msg}`);
}

function shell(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
}

function cleanup() {
  try {
    spawnSync('docker', ['rm', '-f', CONTAINER], { stdio: 'pipe' });
  } catch {}
}

process.on('SIGINT', () => { cleanup(); process.exit(130); });
process.on('SIGTERM', () => { cleanup(); process.exit(143); });

// 1. preflight
try { shell('docker version'); } catch { fail(2, 'docker not available'); }

if (!existsSync(SCHEMA)) fail(2, `schema.prisma missing at ${SCHEMA}`);

let backupPath = explicitBackup;
if (!backupPath) {
  if (!existsSync(MANIFEST)) fail(2, `.backup-manifest.json missing; pass --backup=path or generate one first`);
  const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  backupPath = m.latest ?? m.backups?.[0]?.path;
  if (!backupPath) fail(2, '.backup-manifest.json has no latest backup');
}

if (!existsSync(backupPath)) fail(2, `backup file not found: ${backupPath}`);

ok(`using backup: ${backupPath}`);

const t0 = Date.now();

// 2. spin postgres container
try {
  shell(
    `docker run -d --name ${CONTAINER} ` +
    `-e POSTGRES_PASSWORD=${PG_PASSWORD} -e POSTGRES_DB=kloel ` +
    `-p ${PG_PORT}:5432 postgres:16`,
  );
} catch (e) {
  fail(2, `docker run failed: ${e.message}`);
}

// wait for ready
for (let i = 0; i < 30; i++) {
  try {
    shell(`docker exec ${CONTAINER} pg_isready -U postgres -d kloel`, { stdio: 'pipe' });
    break;
  } catch {
    if (i === 29) fail(2, 'postgres never became ready in 30s');
    await new Promise((r) => setTimeout(r, 1000));
  }
}
ok('postgres container ready');

// 3. restore
try {
  if (backupPath.endsWith('.gz')) {
    shell(`gunzip -c ${backupPath} | docker exec -i ${CONTAINER} psql -U postgres -d kloel -v ON_ERROR_STOP=1`);
  } else {
    shell(`docker exec -i ${CONTAINER} psql -U postgres -d kloel -v ON_ERROR_STOP=1 < ${backupPath}`);
  }
  ok('backup restored');
} catch (e) {
  fail(1, `restore failed: ${e.message?.slice(0, 200)}`);
}

const restoreMs = Date.now() - t0;

// 4. prisma migrate diff — schema vs restored DB must be empty
let diffEmpty = true;
let diffOutput = '';
try {
  diffOutput = shell(
    `DATABASE_URL=postgresql://postgres:${PG_PASSWORD}@localhost:${PG_PORT}/kloel ` +
    `npx prisma migrate diff ` +
    `--from-url postgresql://postgres:${PG_PASSWORD}@localhost:${PG_PORT}/kloel ` +
    `--to-schema-datamodel ${SCHEMA} ` +
    `--script`,
    { cwd: resolve(REPO_ROOT, 'backend') },
  );
  // empty diff = no migration script needed
  diffEmpty = !diffOutput.trim() || diffOutput.includes('-- This is an empty migration.');
} catch (e) {
  diffEmpty = false;
  diffOutput = e.message;
}

if (!diffEmpty) {
  console.error('[dr-drill] schema drift detected:');
  console.error(diffOutput.slice(0, 2000));
}

// 5. sentinel queries
let workspaceCount = -1;
let activeWorkspaces = -1;
try {
  workspaceCount = parseInt(
    shell(
      `docker exec ${CONTAINER} psql -U postgres -d kloel -t -A -c "SELECT count(*) FROM \\"RAC_Workspace\\""`,
    ).trim(),
    10,
  );
  activeWorkspaces = parseInt(
    shell(
      `docker exec ${CONTAINER} psql -U postgres -d kloel -t -A -c "SELECT count(DISTINCT w.id) FROM \\"RAC_Workspace\\" w JOIN \\"RAC_Agent\\" a ON a.\\"workspaceId\\" = w.id"`,
    ).trim(),
    10,
  );
} catch (e) {
  fail(1, `sentinel queries failed: ${e.message?.slice(0, 200)}`);
}

const pass = diffEmpty && workspaceCount >= 0 && activeWorkspaces >= 0;

// 6. append to .dr-test.log
const line = JSON.stringify({
  timestamp: new Date().toISOString(),
  backupPath,
  restoreMs,
  schemaDriftClean: diffEmpty,
  workspaceCount,
  activeWorkspaces,
  pass,
}) + '\n';
appendFileSync(DR_LOG, line);

// 7. update manifest
if (existsSync(MANIFEST)) {
  try {
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    m.lastVerifiedAt = new Date().toISOString();
    m.lastVerifyResult = { pass, restoreMs, workspaceCount, activeWorkspaces };
    writeFileSync(MANIFEST, JSON.stringify(m, null, 2));
  } catch {}
}

// 8. cleanup
cleanup();

if (pass) {
  ok(`PASS in ${restoreMs}ms — ${workspaceCount} workspaces, ${activeWorkspaces} active`);
  process.exit(0);
} else {
  fail(1, 'one or more assertions failed (see .dr-test.log for detail)');
}
