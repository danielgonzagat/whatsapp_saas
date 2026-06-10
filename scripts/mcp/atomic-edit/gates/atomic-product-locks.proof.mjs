#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(sourceDir, `.proof-product-locks-${process.pid}`);
const results = [];

function record(name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function cleanup(root, ids) {
  for (const id of ids) {
    if (!id || !/^(proof-lock|scripts-mcp-atomic-edit-proof-lock-target\.ts)-/.test(id)) continue;
    fs.rmSync(path.join(root, id), { recursive: true, force: true });
  }
}

async function main() {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.mkdirSync(fixtureRoot, { recursive: true });
  process.env.ATOMIC_EDIT_REPO_ROOT = fixtureRoot;
  const compiled = path.join(sourceDir, 'dist', 'server-helpers-product-locks.js');
  const mod = await import(`${pathToFileURL(compiled).href}?proof=${Date.now()}`);
  const root = mod.lockRoot();
  const ids = [];

  try {
    fs.mkdirSync(root, { recursive: true });

    const legacyId = `proof-lock-heartbeat-only-${process.pid}`;
    ids.push(legacyId);
    const legacyDir = path.join(root, legacyId);
    fs.mkdirSync(legacyDir, { recursive: true });
    const legacyHeartbeat = Date.now() - 45_000;
    fs.writeFileSync(path.join(legacyDir, 'heartbeat'), String(legacyHeartbeat));

    const legacy = mod.readLockRecord(legacyId);
    const listedLegacy = mod.listLocks().find((entry) => entry.frontId === legacyId);
    record(
      'legacy heartbeat-only auto locks are readable diagnostic records',
      legacy?.status === 'heartbeat-only' &&
        legacy?.metadataMissing === true &&
        legacy?.recoverableByForceRelease === true &&
        legacy?.heartbeatTimestampMs === legacyHeartbeat,
      { legacy },
    );
    record(
      'listLocks preserves heartbeat-only lock evidence instead of opaque unreadable',
      listedLegacy?.status === 'heartbeat-only' &&
        listedLegacy?.lockReadOk === true &&
        listedLegacy?.lockFormat === 'heartbeat-only' &&
        listedLegacy?.metadataMissing === true,
      { listedLegacy },
    );

    const invalidId = `proof-lock-invalid-${process.pid}`;
    ids.push(invalidId);
    const invalidDir = path.join(root, invalidId);
    fs.mkdirSync(invalidDir, { recursive: true });
    fs.writeFileSync(path.join(invalidDir, 'lock'), 'not json and not key values\n');
    const invalid = mod.readLockRecord(invalidId);
    const listedInvalid = mod.listLocks().find((entry) => entry.frontId === invalidId);
    record(
      'malformed lock metadata stays negative with a specific read error',
      invalid === null &&
        listedInvalid?.status === 'unreadable' &&
        listedInvalid?.lockReadOk === false &&
        listedInvalid?.lockError === 'invalid-lock-record',
      { invalid, listedInvalid },
    );

    const targetRel = 'scripts/mcp/atomic-edit/proof-lock-target.ts';
    const autoId = mod.autoLockFile(targetRel);
    ids.push(autoId);
    const auto = autoId ? mod.readLockRecord(autoId) : null;
    const listedAuto = mod.listLocks().find((entry) => entry.frontId === autoId);
    record(
      'new auto locks carry JSON metadata receipts',
      typeof autoId === 'string' &&
        auto?.owner === 'atomic-auto-lock' &&
        auto?.status === 'auto-claimed' &&
        auto?.lockKind === 'auto-file' &&
        Array.isArray(auto?.allowedFiles) &&
        auto.allowedFiles.includes(targetRel) &&
        listedAuto?.lockReadOk === true &&
        listedAuto?.lockFormat === 'json',
      { autoId, auto, listedAuto },
    );
  } finally {
    cleanup(root, ids);
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
}

await main();
const failed = results.filter((result) => !result.ok);
if (jsonMode) {
  console.log(JSON.stringify({ ok: failed.length === 0, total: results.length, failed, results }, null, 2));
} else {
  for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
}
if (failed.length > 0) process.exit(1);
