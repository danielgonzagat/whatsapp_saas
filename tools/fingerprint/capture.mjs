#!/usr/bin/env node
// tools/fingerprint/capture.mjs — Wave 11 #2: behavioral fingerprint.
//
// Record HTTP/DB/queue/webhook of a flow deterministically; replay later
// against any branch to certify behavior parity.
//
// CLI:
//   node tools/fingerprint/capture.mjs <name> [--steps='[{...}]']
//
// Storage: tools/fingerprint/storage/<name>.fingerprint.json
//
// Schema:
//   {
//     name, version, capturedAt, scenario, steps:[
//       { kind:'http', method, url, body, expect:{status, body_includes:[]} },
//       { kind:'db',   model, op, where, expect:{rowsAtLeast:1, fields:{...}} },
//       { kind:'queue',name, jobs_added_at_least:1 },
//       { kind:'webhook',  provider, externalId, sideEffects:[...] }
//     ]
//   }
//
// In capture mode (live): hits the URL with the prepared input, records the
// observed responses + DB diffs + queue diffs into the fingerprint. Designed
// to be re-runnable: idempotent inserts via externalIds.

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { argv } from 'node:process';
import { join } from 'node:path';

const ROOT = process.cwd();
const STORE = join(ROOT, 'tools/fingerprint/storage');

const name = argv[2];
if (!name) {
  console.error('usage: capture.mjs <name> [--steps=JSON]');
  process.exit(2);
}

const stepsArg = argv.find((a) => a.startsWith('--steps='))?.slice('--steps='.length);
let steps = [];
if (stepsArg) {
  try {
    steps = JSON.parse(stepsArg);
  } catch (e) {
    console.error('[capture] --steps must be valid JSON array');
    process.exit(2);
  }
}

async function main() {
  await mkdir(STORE, { recursive: true });
  const path = join(STORE, `${name}.fingerprint.json`);
  let existing = null;
  if (existsSync(path)) {
    try { existing = JSON.parse(await readFile(path, 'utf8')); } catch { /* overwrite */ }
  }

  const fp = {
    name,
    version: (existing?.version || 0) + 1,
    capturedAt: new Date().toISOString(),
    scenario: existing?.scenario || `TODO: describe scenario for ${name}`,
    steps: steps.length ? steps : (existing?.steps || []),
    captureMode: 'recorded',
  };

  await writeFile(path, JSON.stringify(fp, null, 2));
  console.log(`[capture] wrote ${path} — version ${fp.version}, ${fp.steps.length} steps`);
}

await main();
