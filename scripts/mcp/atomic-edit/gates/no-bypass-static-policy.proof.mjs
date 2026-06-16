#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const fixtureRoot = path.join(
  sourceDir,
  `.proof-no-bypass-static-policy-${process.pid}-${process.hrtime.bigint().toString(36)}`,
);

const detectableEvents = [
  { tool_name: 'Write', tool_input: { file_path: path.join(fixtureRoot, 'src', 'example.ts'), content: 'export const x = 1;\n' }, wantCategory: 'native-edit' },
  { tool_name: 'Read', tool_input: { file_path: path.join(fixtureRoot, 'src', 'example.ts') }, wantCategory: 'native-read' },
  { tool_name: 'Grep', tool_input: { pattern: 'example' }, wantCategory: 'native-grep' },
  { tool_name: 'Glob', tool_input: { pattern: '**/*.ts' }, wantCategory: 'native-glob' },
  { tool_name: 'Bash', tool_input: { command: 'git status --short' }, wantCategory: 'bash-exec' },
  { tool_name: 'Bash', tool_input: { command: 'cat src/example.ts' }, wantCategory: 'bash-read' },
];

function record(results, name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

function parseJson(stdout) {
  try {
    return JSON.parse(stdout || '{}');
  } catch (error) {
    return { parseError: error instanceof Error ? error.message : String(error), stdout };
  }
}

function permissionDecision(parsed) {
  return parsed?.permissionDecision ?? parsed?.hookSpecificOutput?.permissionDecision;
}

function hookPolicy() {
  const configPath = path.join(os.homedir(), '.codex', 'config.toml');
  const hooksEnabled = fs.existsSync(configPath) && /^hooks\s*=\s*true\b/m.test(fs.readFileSync(configPath, 'utf8'));
  const hooksPath = path.join(repoRoot, '.codex', 'hooks.json');
  let catchAll = null;
  let hookCommands = [];
  let parseError = null;
  try {
    const config = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    const preToolUse = Array.isArray(config?.hooks?.PreToolUse) ? config.hooks.PreToolUse : [];
    catchAll = preToolUse.find((entry) => String(entry?.matcher ?? '') === '.*') ?? null;
    hookCommands = Array.isArray(catchAll?.hooks)
      ? catchAll.hooks.map((hook) => String(hook?.command ?? ''))
      : [];
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }
  const observerIndex = hookCommands.findIndex((command) => command.includes('bypass-observer-hook.mjs'));
  const denyIndex = hookCommands.findIndex((command) => command.includes('codex-atomic-only-hook.mjs'));
  return {
    hooksEnabled,
    catchAllPresent: Boolean(catchAll),
    observerIndex,
    denyIndex,
    observerBeforeDeny: observerIndex >= 0 && denyIndex >= 0 && observerIndex < denyIndex,
    parseError,
  };
}

function resetFixture() {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(fixtureRoot, '.atomic'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, '.codex'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, 'src'), { recursive: true });
  fs.writeFileSync(path.join(fixtureRoot, 'src', 'example.ts'), 'export const example = 1;\n');
  fs.writeFileSync(
    path.join(fixtureRoot, '.codex', 'hooks.json'),
    JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: '.*',
              hooks: [
                { type: 'command', command: 'node ${CODEX_PROJECT_DIR:-$PWD}/scripts/mcp/atomic-edit/bypass-observer-hook.mjs' },
                { type: 'command', command: 'node ${CODEX_PROJECT_DIR:-$PWD}/scripts/mcp/atomic-edit/codex-atomic-only-hook.mjs' },
              ],
            },
          ],
        },
      },
      null,
      2,
    ),
  );
}

function runHook(script, event, extraEnv = {}) {
  return childProcess.spawnSync(process.execPath, [path.join(sourceDir, script)], {
    cwd: sourceDir,
    input: JSON.stringify(event),
    encoding: 'utf8',
    timeout: 10000,
    env: {
      ...process.env,
      CODEX_PROJECT_DIR: fixtureRoot,
      CLAUDE_PROJECT_DIR: '',
      ...extraEnv,
    },
  });
}

function runReport() {
  const result = childProcess.spawnSync(process.execPath, [path.join(sourceDir, 'bypass-report.mjs'), '--json'], {
    cwd: sourceDir,
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, CODEX_PROJECT_DIR: fixtureRoot, CLAUDE_PROJECT_DIR: '' },
  });
  if (result.status !== 0) return { ok: false, status: result.status, stdout: result.stdout, stderr: result.stderr };
  return { ok: true, value: parseJson(result.stdout) };
}

function main() {
  const results = [];
  const policy = hookPolicy();
  record(
    results,
    'Codex global hooks are enabled and workspace catch-all observer precedes strict deny hook',
    policy.hooksEnabled && policy.catchAllPresent && policy.observerBeforeDeny,
    policy,
  );

  const hostEnv = {
    ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec',
    ATOMIC_HOST_ATOMIC_ONLY: '1',
    ATOMIC_HOST_WRITE_ROOT: fixtureRoot,
  };

  try {
    resetFixture();
    const denied = [];
    const observed = [];
    for (const event of detectableEvents) {
      const deny = runHook('codex-atomic-only-hook.mjs', event, hostEnv);
      const parsed = parseJson(deny.stdout);
      denied.push({ event, status: deny.status, parsed, stderr: deny.stderr });
      const observer = runHook('bypass-observer-hook.mjs', event, hostEnv);
      observed.push({ event, status: observer.status, stdout: observer.stdout, stderr: observer.stderr });
    }
    record(
      results,
      'Codex strict hook denies every representative detectable non-atomic tool call',
      denied.every((entry) => entry.status === 0 && permissionDecision(entry.parsed) === 'deny'),
      { denied },
    );

    const ledgerPath = path.join(fixtureRoot, '.atomic', 'bypass-ledger.jsonl');
    const heartbeatPath = path.join(fixtureRoot, '.atomic', 'bypass-observer-heartbeat.jsonl');
    const ledgerRecords = fs.existsSync(ledgerPath)
      ? fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).map(parseJson)
      : [];
    const heartbeatRecords = fs.existsSync(heartbeatPath)
      ? fs.readFileSync(heartbeatPath, 'utf8').split('\n').filter(Boolean).map(parseJson)
      : [];
    record(
      results,
      'Observer classifies representative detectable calls as strict prevented opportunities',
      observed.every((entry) => entry.status === 0) &&
        ledgerRecords.length === detectableEvents.length &&
        heartbeatRecords.length === detectableEvents.length &&
        detectableEvents.every((event) =>
          ledgerRecords.some(
            (recordEntry) =>
              recordEntry.tool === event.tool_name &&
              recordEntry.category === event.wantCategory &&
              recordEntry.strictAtomicOnly === true &&
              recordEntry.blockedByDenyHook === true &&
              typeof recordEntry.atomicEquivalent === 'string',
          ),
        ),
      { observed, ledgerRecords, heartbeatRecords },
    );

    const report = runReport();
    record(
      results,
      'Fixture bypass report is observed-clean only after strict denied opportunities',
      report.ok === true &&
        report.value?.status === 'observed-clean' &&
        report.value?.detectableOpportunities === detectableEvents.length &&
        report.value?.preventedByDenyHook === detectableEvents.length &&
        report.value?.silentlyAllowedBypasses === 0,
      report,
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
