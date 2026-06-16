#!/usr/bin/env node
/**
 * pilot-runner.proof.mjs — executable proof for the pilot runner CLI.
 * Exercises the real runner in run and read-only verification modes.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const runner = path.join(here, 'pilot-runner.mjs');
const checks = [];
const check = (id, ok, detail) => checks.push({ id, ok: ok === true, detail: detail ?? null });

function run(args) {
  const proc = spawnSync(process.execPath, [runner, ...args], {
    cwd: here,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  let json = null;
  try {
    json = JSON.parse(proc.stdout || '{}');
  } catch (error) {
    json = { parseError: error instanceof Error ? error.message : String(error), stdout: proc.stdout };
  }
  return { status: proc.status, stdout: proc.stdout, stderr: proc.stderr, json };
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pilot-runner-proof-'));
try {
  const runDir = path.join(tmpRoot, 'run-mode');
  fs.mkdirSync(runDir);
  const runResult = run(['--run', runDir]);
  check('P1a.explicit-run-mode-succeeds', runResult.status === 0 && runResult.json.ok === true, JSON.stringify({ status: runResult.status, json: runResult.json, stderr: runResult.stderr }));

  const verifyResult = run(['--verify', runDir]);
  check('P1b.verify-mode-succeeds-on-fresh-artifacts', verifyResult.status === 0 && verifyResult.json.ok === true && verifyResult.json.mode === 'verify', JSON.stringify({ status: verifyResult.status, json: verifyResult.json, stderr: verifyResult.stderr }));
  check('P1c.verify-cross-checks-ledger-summary', verifyResult.json?.ok === true && verifyResult.json?.summary?.ledger?.records === verifyResult.json?.ledger?.records && verifyResult.json?.summary?.ledger?.head === verifyResult.json?.ledger?.head, JSON.stringify(verifyResult.json));

  const ledgerPath = path.join(runDir, 'run-ledger.jsonl');
  if (fs.existsSync(ledgerPath)) {
    const originalLedger = fs.readFileSync(ledgerPath, 'utf8');
    const tamperedLedger = originalLedger.replace('"generation":1', '"generation":99');
    fs.writeFileSync(ledgerPath, tamperedLedger);
    const tamperedResult = run(['--verify', runDir]);
    check('P2a.verify-mode-rejects-tampered-ledger', tamperedResult.status !== 0 && tamperedResult.json.ok === false && Array.isArray(tamperedResult.json.errors) && tamperedResult.json.errors.length > 0, JSON.stringify({ status: tamperedResult.status, json: tamperedResult.json, stderr: tamperedResult.stderr }));
  } else {
    check('P2a.verify-mode-rejects-tampered-ledger', false, 'run mode did not create run-ledger.jsonl');
  }

  const positionalDir = path.join(tmpRoot, 'positional-run');
  fs.mkdirSync(positionalDir);
  const positionalResult = run([positionalDir]);
  check('P3a.backward-compatible-positional-run-succeeds', positionalResult.status === 0 && positionalResult.json.ok === true && fs.existsSync(path.join(positionalDir, 'summary.json')), JSON.stringify({ status: positionalResult.status, json: positionalResult.json, stderr: positionalResult.stderr }));
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

const failed = checks.filter((c) => !c.ok);
const result = {
  ok: failed.length === 0,
  gate: 'pilot-runner-cli',
  checks,
  failedCount: failed.length,
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exit(result.ok ? 0 : 1);
