#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureRoot = path.join(sourceDir, '.proof-bypass-observer-heartbeat');

function record(results, name, ok, detail) {
  results.push({ name, ok, detail });
}

function resetFixture() {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(fixtureRoot, '.atomic'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, '.codex'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, '.codex', 'hooks.json'),
    JSON.stringify({ hooks: { PreToolUse: [{ matcher: '.*', hooks: [{ command: 'bypass-observer-hook.mjs' }] }] } }, null, 2),
  );
}

function runReport() {
  const result = childProcess.spawnSync(process.execPath, [path.join(sourceDir, 'bypass-report.mjs'), '--json'], {
    cwd: sourceDir,
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, CODEX_PROJECT_DIR: fixtureRoot, CLAUDE_PROJECT_DIR: '' },
  });
  if (result.status !== 0) return { ok: false, result };
  try {
    return { ok: true, value: JSON.parse(result.stdout) };
  } catch (error) {
    return { ok: false, result, parseError: error instanceof Error ? error.message : String(error) };
  }
}

function runObserverForAtomicTool() {
  return childProcess.spawnSync(process.execPath, [path.join(sourceDir, 'bypass-observer-hook.mjs')], {
    cwd: sourceDir,
    input: JSON.stringify({ tool_name: 'mcp__atomic_edit.atomic_exec', tool_input: { command: 'true' } }),
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, CODEX_PROJECT_DIR: fixtureRoot, CLAUDE_PROJECT_DIR: '' },
  });
}

function main() {
  const results = [];
  try {
    resetFixture();
    const before = runReport();
    record(
      results,
      'installed observer with no heartbeat stays unobserved',
      before.ok === true && before.value?.observerInstalled === true && before.value?.status === 'unobserved',
      before,
    );

    const observed = runObserverForAtomicTool();
    const heartbeatPath = path.join(fixtureRoot, '.atomic', 'bypass-observer-heartbeat.jsonl');
    const ledgerPath = path.join(fixtureRoot, '.atomic', 'bypass-ledger.jsonl');
    const heartbeatExists = fs.existsSync(heartbeatPath);
    record(
      results,
      'observer writes heartbeat for non-bypass atomic tool without bypass ledger entry',
      observed.status === 0 && heartbeatExists && !fs.existsSync(ledgerPath),
      { status: observed.status, stdout: observed.stdout, stderr: observed.stderr, heartbeatExists, ledgerExists: fs.existsSync(ledgerPath) },
    );

    const after = runReport();
    record(
      results,
      'heartbeat-only zero-opportunity traffic is watching, not observed-clean',
      after.ok === true &&
        after.value?.observerInstalled === true &&
        after.value?.observedHookEvents === 1 &&
        after.value?.detectableOpportunities === 0 &&
        after.value?.silentlyAllowedBypasses === 0 &&
        after.value?.observed === false &&
        after.value?.status === 'watching',
      after,
    );
  } finally {
    fs.rmSync(fixtureRoot, { recursive: true, force: true });
  }
  return { ok: results.every((entry) => entry.ok), results };
}

const result = main();
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of result.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(result.ok ? 0 : 1);
