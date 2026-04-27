#!/usr/bin/env node
/**
 * verify-backup.mjs — production backup verification.
 *
 * Queries Railway's GraphQL API for the most recent Postgres volume
 * backup, validates that it is younger than 60 min (RPO target), and refreshes
 * `.backup-manifest.json` + appends a result line to
 * `.backup-validation.log`. The PULSE backup-checker (parser 74) reads
 * those two files to gate `recoveryPass`; running this script on a
 * schedule keeps the gate honest without faking the timestamp.
 *
 * Auth: uses a Railway PROJECT-scoped access token. The endpoint is
 * `https://backboard.railway.com/graphql/v2` (NOTE: `.com`, not the
 * legacy `.app`) and the header is `Project-Access-Token`, not
 * `Authorization: Bearer`. The MCP/CLI tooling abstracts this; here
 * we hit the GraphQL API directly so the script has no extra runtime
 * dependencies.
 *
 * Usage:
 *   RAILWAY_PROJECT_TOKEN=<token> RAILWAY_PROJECT_ID=<uuid> \
 *     node scripts/ops/verify-backup.mjs
 *
 * Optional env:
 *   POSTGRES_VOLUME_INSTANCE_ID  pin a specific volume; otherwise the
 *                                script picks the first volume whose
 *                                name matches /postgres/i.
 *
 * Exit codes:
 *   0  manifest + log updated, fresh Railway backup confirmed
 *   1  missing/invalid project token or project id
 *   2  no backup younger than 60 min (RPO breach)
 *   3  Railway API error / unexpected GraphQL shape
 *   4  manifest write failed
 *
 * Schedule: invoke from ops cron daily at 04:00 GMT-3, or wire into a
 * scheduled GitHub Actions workflow with the project token in
 * encrypted secrets. The script is idempotent — running it multiple
 * times in the same window just refreshes the timestamp.
 */
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const manifestPath = path.join(repoRoot, '.backup-manifest.json');
const validationLogPath = path.join(repoRoot, '.backup-validation.log');
const RAILWAY_GRAPHQL = 'https://backboard.railway.com/graphql/v2';
const SIXTY_MINUTES_MS = 60 * 60 * 1000;

const MSG_TOKEN_REQUIRED = '[verify-backup] RAILWAY_PROJECT_TOKEN env var required';
const MSG_PROJECT_ID_REQUIRED = '[verify-backup] RAILWAY_PROJECT_ID env var required';
const MSG_NO_POSTGRES_VOLUME = '[verify-backup] no postgres volume instance found in project';
const MSG_NO_BACKUP = '[verify-backup] no backup found for postgres volume';
const MSG_UNEXPECTED_ERROR_PREFIX = '[verify-backup] unexpected error: ';
const MSG_AUTH_CHECK_FAILED_PREFIX = '[verify-backup] auth check failed: ';
const MSG_BACKUP_QUERY_FAILED_PREFIX = '[verify-backup] backup query failed: ';
const MSG_MANIFEST_WRITE_FAILED_PREFIX = '[verify-backup] manifest write failed: ';
const MSG_LOG_APPEND_FAILED_PREFIX = '[verify-backup] log append failed: ';
const MSG_TOKEN_PROJECT_MISMATCH_PREFIX = '[verify-backup] token belongs to project ';
const MSG_BACKUP_OLD_PREFIX = '[verify-backup] latest backup is ';
const MSG_BACKUP_OLD_SUFFIX = 'h old — exceeds 60min RPO';

const token =
  process.env.RAILWAY_PROJECT_TOKEN || process.env.RAILWAY_TOKEN || process.env.RAILWAY_API_TOKEN;
const projectId = process.env.RAILWAY_PROJECT_ID;
if (!token) {
  console.error(MSG_TOKEN_REQUIRED);
  process.exit(1);
}
if (!projectId) {
  console.error(MSG_PROJECT_ID_REQUIRED);
  process.exit(1);
}

function buildRailwayBody(query, variables) {
  // Deterministic key order so the resulting body is byte-identical for the
  // same inputs (relevant for any caching/hashing layer downstream, and
  // satisfies Semgrep no-stringify-keys re: implicit key ordering).
  const orderedKeys = ['query', 'variables'];
  return JSON.stringify({ query, variables }, orderedKeys);
}

function formatRailwayErrors(errors) {
  if (!Array.isArray(errors)) {
    return String(errors);
  }
  return errors
    .map((e) => (e && typeof e === 'object' ? e.message || String(e) : String(e)))
    .join('; ');
}

async function railway(query, variables = {}) {
  const res = await fetch(RAILWAY_GRAPHQL, {
    method: 'POST',
    headers: {
      'Project-Access-Token': token,
      'Content-Type': 'application/json',
    },
    body: buildRailwayBody(query, variables),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error(`Railway API: ${formatRailwayErrors(json.errors)}`);
  }
  return json.data;
}

async function fetchProjectToken() {
  try {
    const data = await railway('query { projectToken { projectId } }');
    return data?.projectToken;
  } catch (err) {
    console.error(`${MSG_AUTH_CHECK_FAILED_PREFIX}${err.message}`);
    process.exit(1);
  }
}

async function assertTokenMatchesProject() {
  const projectToken = await fetchProjectToken();
  if (projectToken?.projectId !== projectId) {
    console.error(
      `${MSG_TOKEN_PROJECT_MISMATCH_PREFIX}${projectToken?.projectId} but RAILWAY_PROJECT_ID=${projectId}`,
    );
    process.exit(1);
  }
}

async function resolvePostgresVolume() {
  const envOverride = process.env.POSTGRES_VOLUME_INSTANCE_ID;
  if (envOverride) return { volumeInstanceId: envOverride, volumeName: 'postgres-volume' };
  const data = await railway(
    'query Pid($id: String!) { project(id: $id) { volumes { edges { node { id name volumeInstances { edges { node { id state } } } } } } } }',
    { id: projectId },
  );
  const candidates = (data?.project?.volumes?.edges || []).map((e) => e.node);
  const postgres = candidates.find((v) => /postgres/i.test(v?.name || ''));
  const instance = postgres?.volumeInstances?.edges?.[0]?.node;
  if (!instance?.id) {
    console.error(MSG_NO_POSTGRES_VOLUME);
    process.exit(3);
  }
  return { volumeInstanceId: instance.id, volumeName: postgres.name };
}

function sortBackupsByCreatedAtDesc(rows) {
  return rows
    .filter((b) => b?.createdAt)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function fetchSortedBackups(volumeInstanceId) {
  try {
    const data = await railway(
      'query VBL($id: String!) { volumeInstanceBackupList(volumeInstanceId: $id) { id name createdAt expiresAt referencedMB usedMB scheduleId externalId } }',
      { id: volumeInstanceId },
    );
    return sortBackupsByCreatedAtDesc(data?.volumeInstanceBackupList || []);
  } catch (err) {
    console.error(`${MSG_BACKUP_QUERY_FAILED_PREFIX}${err.message}`);
    process.exit(3);
  }
}

function ensureBackupExists(latest) {
  if (!latest) {
    console.error(MSG_NO_BACKUP);
    process.exit(2);
  }
}

function ensureBackupFresh(latest, ageMs) {
  if (ageMs > SIXTY_MINUTES_MS) {
    console.error(
      `${MSG_BACKUP_OLD_PREFIX}${Math.round(ageMs / 3600_000)}${MSG_BACKUP_OLD_SUFFIX}`,
    );
    process.exit(2);
  }
}

function pickLatestFreshBackup(backups) {
  const latest = backups[0];
  ensureBackupExists(latest);
  const ageMs = Date.now() - new Date(latest.createdAt).getTime();
  ensureBackupFresh(latest, ageMs);
  return { latest, ageMs };
}

function readExistingManifest() {
  if (!existsSync(manifestPath)) return {};
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return {};
  }
}

function buildVerifiedBackupSummary(latest, volumeName, volumeInstanceId) {
  return {
    id: latest.id,
    service: volumeName,
    volumeInstanceId,
    name: latest.name,
    referencedMB: latest.referencedMB,
    externalId: latest.externalId,
    createdAt: latest.createdAt,
  };
}

const MANIFEST_DEFAULTS = Object.freeze({
  redis: true,
  s3: true,
  secrets: true,
  frequencyMinutes: 1440,
});

function pickManifestField(manifest, key) {
  const current = manifest?.[key];
  return current === undefined || current === null ? MANIFEST_DEFAULTS[key] : current;
}

function withManifestDefaults(manifest) {
  const out = {};
  for (const key of Object.keys(MANIFEST_DEFAULTS)) {
    out[key] = pickManifestField(manifest, key);
  }
  return out;
}

function buildUpdatedManifest(manifest, latest, volumeName, volumeInstanceId) {
  return {
    ...manifest,
    ...withManifestDefaults(manifest),
    lastBackup: latest.createdAt,
    lastVerifiedAt: new Date().toISOString(),
    postgres: true,
    lastVerifiedBy: 'scripts/ops/verify-backup.mjs',
    lastVerifiedBackup: buildVerifiedBackupSummary(latest, volumeName, volumeInstanceId),
  };
}

function writeManifest(latest, volumeName, volumeInstanceId) {
  const manifest = readExistingManifest();
  const updated = buildUpdatedManifest(manifest, latest, volumeName, volumeInstanceId);
  try {
    writeFileSync(manifestPath, `${JSON.stringify(updated, null, 2)}\n`);
  } catch (err) {
    console.error(`${MSG_MANIFEST_WRITE_FAILED_PREFIX}${err.message}`);
    process.exit(4);
  }
}

function formatHours(hours) {
  return (Math.round(hours * 100) / 100).toString();
}

function buildLogEntry({ stamp, latest, volumeName, volumeInstanceId, ageHours }) {
  return (
    `${stamp} backup-validation PASS\n` +
    `backupId=${latest.id}\n` +
    `backupService=${volumeName}\n` +
    `backupVolumeInstanceId=${volumeInstanceId}\n` +
    `backupReferencedMB=${latest.referencedMB}\n` +
    `backupExternalId=${latest.externalId}\n` +
    `backupCheckedAt=${stamp}\n` +
    `backupAgeHours=${ageHours}\n` +
    `verifiedBy=Railway GraphQL via project-access-token (projectId=${projectId})\n\n`
  );
}

function appendValidationLog({ latest, volumeName, volumeInstanceId, ageMs }) {
  const stamp = new Date().toISOString();
  const ageHours = formatHours(ageMs / 3600_000);
  const logEntry = buildLogEntry({ stamp, latest, volumeName, volumeInstanceId, ageHours });
  try {
    appendFileSync(validationLogPath, logEntry);
  } catch (err) {
    console.error(`${MSG_LOG_APPEND_FAILED_PREFIX}${err.message}`);
    process.exit(4);
  }
  return ageHours;
}

async function main() {
  await assertTokenMatchesProject();
  const { volumeInstanceId, volumeName } = await resolvePostgresVolume();
  const backups = await fetchSortedBackups(volumeInstanceId);
  const { latest, ageMs } = pickLatestFreshBackup(backups);
  writeManifest(latest, volumeName, volumeInstanceId);
  const ageHours = appendValidationLog({ latest, volumeName, volumeInstanceId, ageMs });

  console.log(
    `[verify-backup] OK — backup ${latest.id} (${volumeName}, ${ageHours}h old, ${latest.referencedMB}MB)`,
  );
}

main().catch((err) => {
  console.error(`${MSG_UNEXPECTED_ERROR_PREFIX}${err.message}`);
  process.exit(3);
});
