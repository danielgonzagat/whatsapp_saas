#!/usr/bin/env node
/**
 * Proof #1 honesty: bypass-report distinguishes UNOBSERVED from observed-clean.
 * Runs bypass-report.mjs against three synthetic ledgers in an isolated
 * CLAUDE_PROJECT_DIR and asserts:
 *   1. empty ledger        -> status 'unobserved', observed false (NOT green-by-absence)
 *   2. clean-but-present    -> status 'observed-clean', observed true
 *   3. silent bypass present -> status 'bypasses-present', silentlyAllowed>0
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const here = path.dirname(fileURLToPath(import.meta.url));
const report = path.resolve(here, '..', 'bypass-report.mjs');

function runWith(ledgerLines) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bypass-honesty-'));
  try {
    if (ledgerLines !== null) {
      fs.mkdirSync(path.join(root, '.atomic'), { recursive: true });
      fs.writeFileSync(path.join(root, '.atomic', 'bypass-ledger.jsonl'), ledgerLines);
    }
    const out = execFileSync('node', [report, '--json'], { encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root } });
    return JSON.parse(out);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

const results = [];
const rec = (name, ok, detail) => results.push({ name, ok: Boolean(ok), detail });

const empty = runWith(null);
rec('empty ledger is UNOBSERVED (not green-by-absence)', empty.status === 'unobserved' && empty.observed === false, { status: empty.status, observed: empty.observed });

const clean = runWith(JSON.stringify({ ts: Date.now(), tool: 'Bash', category: 'bash-edit', blockedByDenyHook: true, atomicEquivalent: 'atomic_replace_text' }) + '\n');
rec('clean-but-present ledger is observed-clean', clean.status === 'observed-clean' && clean.observed === true && clean.silentlyAllowedBypasses === 0, { status: clean.status });

const bypassed = runWith(JSON.stringify({ ts: Date.now(), tool: 'Write', category: 'native-edit', blockedByDenyHook: false, atomicEquivalent: 'atomic_create_file' }) + '\n');
rec('silent bypass present is flagged', bypassed.status === 'bypasses-present' && bypassed.silentlyAllowedBypasses === 1, { status: bypassed.status, silent: bypassed.silentlyAllowedBypasses });

const ok = results.every((r) => r.ok);
if (jsonMode) console.log(JSON.stringify({ ok, results }, null, 2));
else for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name);
process.exit(ok ? 0 : 1);
