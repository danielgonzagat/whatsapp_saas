#!/usr/bin/env node
/**
 * PROOF — proof-carrying snapshots are compact without losing re-exec truth.
 *
 * Before this gate, buildSnapshot serialized large before/after text directly into
 * .atomic/snapshots/*.snap.json. The verifier needs byte-exact reconstruction plus
 * hashes, not raw duplicate source bytes. This proof asserts that new large snapshots
 * use gzip-base64 payloads, decode byte-identically, still re-execute engine.validate,
 * and old legacy { before, after } receipts remain accepted.
 */
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const dir = path.dirname(fileURLToPath(import.meta.url));
const { buildSnapshot, snapshotText, reexecValidate } = await import(path.join(dir, '..', 'dist', 'engine-proof-reexec.js'));
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

let failures = 0;
const results = [];
const expect = (cond, name, detail = undefined) => {
  results.push({ name, ok: !!cond, detail });
  if (!cond) failures += 1;
};

const largeAfter = 'export const scheduledWorkflowStep = 1;\n'.repeat(300);
const snap = buildSnapshot('workflow.ts', '', largeAfter);
const json = JSON.stringify(snap);
const jsonBytes = Buffer.byteLength(json, 'utf8');
const afterBytes = Buffer.byteLength(largeAfter, 'utf8');

expect(!Object.prototype.hasOwnProperty.call(snap, 'after'), 'new snapshots do not store raw after text');
expect(!Object.prototype.hasOwnProperty.call(snap, 'before'), 'new snapshots do not store raw before text');
expect(snap.afterText?.encoding === 'gzip-base64', 'large after payload is gzip-base64 encoded', snap.afterText);
expect(snapshotText(snap, 'after') === largeAfter, 'gzip-base64 after payload decodes byte-exactly');
expect(snapshotText(snap, 'before') === '', 'empty before payload decodes byte-exactly');
expect(jsonBytes < afterBytes * 0.45, 'serialized snapshot is materially smaller than raw content', { jsonBytes, afterBytes });

const validation = { language: 'ts', before: 0, after: 0, ok: true };
const reexec = reexecValidate(snap, validation, snap.afterSha256);
expect(reexec.reproduces === true && reexec.beforeContentOk === true && reexec.afterContentOk === true, 'compact snapshot re-exec reproduces the recorded verdict');

const legacyBefore = 'export const oldValue = 1;\n';
const legacyAfter = 'export const oldValue = 2;\n';
const legacy = {
  file: 'legacy.ts',
  before: legacyBefore,
  after: legacyAfter,
  beforeSha256: sha(legacyBefore),
  afterSha256: sha(legacyAfter),
};
expect(snapshotText(legacy, 'before') === legacyBefore, 'legacy raw before receipts remain decodable');
expect(snapshotText(legacy, 'after') === legacyAfter, 'legacy raw after receipts remain decodable');
expect(reexecValidate(legacy, validation, legacy.afterSha256).reproduces === true, 'legacy raw receipts still re-exec');

let malformedRejected = false;
try {
  snapshotText({ file: 'bad.ts', beforeSha256: 'x', afterSha256: 'y', afterText: { encoding: 'gzip-base64', byteLength: 1, data: 'not-gzip' } }, 'after');
} catch {
  malformedRejected = true;
}
expect(malformedRejected, 'malformed compressed payloads are rejected before trust');

if (jsonMode) {
  console.log(JSON.stringify({ proof: 'proof-snapshot-compact', ok: failures === 0, results, jsonBytes, afterBytes }));
} else {
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}`);
  console.log(failures === 0 ? 'PROOF PASS' : `PROOF FAIL (${failures} assertion(s) failed)`);
}
process.exit(failures === 0 ? 0 : 1);
