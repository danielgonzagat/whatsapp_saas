#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const fixtureRoot = path.join(sourceDir, '.proof-codex-bypass-observer');

const deniedNativeEditEvent = {
  tool_name: 'Write',
  tool_input: {
    file_path: path.join(fixtureRoot, 'src', 'example.ts'),
    content: 'export const bypass = true;\n',
  },
};

const deniedBashExecEvent = {
  tool_name: 'Bash',
  tool_input: {
    command: 'git status --short',
  },
};

function record(results, name, ok, detail) {
  results.push({ name, ok, detail });
}

function resetFixture() {
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
  fs.mkdirSync(path.join(fixtureRoot, '.atomic'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, '.codex'), { recursive: true });
  fs.mkdirSync(path.join(fixtureRoot, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(fixtureRoot, '.codex', 'hooks.json'),
    JSON.stringify(
      {
        hooks: {
          PreToolUse: [
            {
              matcher: '.*',
              hooks: [
                {
                  type: 'command',
                  command: 'node ${CODEX_PROJECT_DIR:-$PWD}/scripts/mcp/atomic-edit/bypass-observer-hook.mjs',
                },
                {
                  type: 'command',
                  command: 'node ${CODEX_PROJECT_DIR:-$PWD}/scripts/mcp/atomic-edit/codex-atomic-only-hook.mjs',
                },
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

function parseJson(stdout) {
  try {
    return JSON.parse(stdout || '{}');
  } catch (error) {
    return { parseError: error instanceof Error ? error.message : String(error), stdout };
  }
}

function hookDecision(parsed) {
  return parsed?.permissionDecision ?? parsed?.hookSpecificOutput?.permissionDecision;
}

function hookReason(parsed) {
  return String(
    parsed?.reason ??
      parsed?.permissionDecisionReason ??
      parsed?.hookSpecificOutput?.permissionDecisionReason ??
      '',
  );
}

function runReportAgainstCodexProjectDir() {
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

function main() {
  const results = [];
  try {
    resetFixture();

    const hostEnv = {
      ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec',
      ATOMIC_HOST_ATOMIC_ONLY: '1',
      ATOMIC_HOST_WRITE_ROOT: fixtureRoot,
    };
    const deniedWrite = runHook('codex-atomic-only-hook.mjs', deniedNativeEditEvent, hostEnv);
    const deniedWriteBody = parseJson(deniedWrite.stdout);
    record(
      results,
      'Codex deny hook refuses native Write to code under host sandbox',
      deniedWrite.status === 0 &&
        hookDecision(deniedWriteBody) === 'deny' &&
        /native\/non-atomic tool "Write" is forbidden/.test(hookReason(deniedWriteBody)),
      { status: deniedWrite.status, stdout: deniedWrite.stdout, stderr: deniedWrite.stderr, parsed: deniedWriteBody },
    );

    const deniedBash = runHook('codex-atomic-only-hook.mjs', deniedBashExecEvent, hostEnv);
    const deniedBashBody = parseJson(deniedBash.stdout);
    record(
      results,
      'Codex deny hook refuses native Bash even when atomic_exec could run the command',
      deniedBash.status === 0 &&
        hookDecision(deniedBashBody) === 'deny' &&
        /native\/non-atomic tool "Bash" is forbidden/.test(hookReason(deniedBashBody)),
      { status: deniedBash.status, stdout: deniedBash.stdout, stderr: deniedBash.stderr, parsed: deniedBashBody },
    );

    const observedWrite = runHook('bypass-observer-hook.mjs', deniedNativeEditEvent, hostEnv);
    const observedBash = runHook('bypass-observer-hook.mjs', deniedBashExecEvent, hostEnv);
    const heartbeatPath = path.join(fixtureRoot, '.atomic', 'bypass-observer-heartbeat.jsonl');
    const ledgerPath = path.join(fixtureRoot, '.atomic', 'bypass-ledger.jsonl');
    const ledgerLines = fs.existsSync(ledgerPath)
      ? fs.readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean)
      : [];
    const ledgerRecords = ledgerLines.map(parseJson);
    const writeRecord = ledgerRecords.find((entry) => entry.tool === 'Write');
    const bashRecord = ledgerRecords.find((entry) => entry.tool === 'Bash');
    record(
      results,
      'bypass observer records strict Codex denials as prevented detectable opportunities',
      observedWrite.status === 0 &&
        observedBash.status === 0 &&
        fs.existsSync(heartbeatPath) &&
        ledgerLines.length === 2 &&
        writeRecord?.category === 'native-edit' &&
        writeRecord?.blockedByDenyHook === true &&
        writeRecord?.strictAtomicOnly === true &&
        bashRecord?.category === 'bash-exec' &&
        bashRecord?.atomicEquivalent === 'atomic_exec' &&
        bashRecord?.blockedByDenyHook === true &&
        bashRecord?.strictAtomicOnly === true,
      {
        writeStatus: observedWrite.status,
        bashStatus: observedBash.status,
        heartbeatExists: fs.existsSync(heartbeatPath),
        ledgerLines,
        ledgerRecords,
      },
    );

    const report = runReportAgainstCodexProjectDir();
    record(
      results,
      'bypass-report resolves CODEX_PROJECT_DIR and reports observed-clean only after real denied opportunities',
      report.ok === true &&
        report.value?.observerInstalled === true &&
        report.value?.observedHookEvents === 2 &&
        report.value?.status === 'observed-clean' &&
        report.value?.detectableOpportunities === 2 &&
        report.value?.preventedByDenyHook === 2 &&
        report.value?.silentlyAllowedBypasses === 0,
      report,
    );

    const observerSource = fs.readFileSync(path.join(sourceDir, 'bypass-observer-hook.mjs'), 'utf8');
    record(
      results,
      'bypass observer writes under CODEX_PROJECT_DIR before Claude/cwd fallback',
      /process\.env\.CODEX_PROJECT_DIR\s*\|\|\s*process\.env\.CLAUDE_PROJECT_DIR\s*\|\|\s*process\.cwd\(\)/.test(observerSource),
    );

    const codexHooks = fs.readFileSync(path.join(repoRoot, '.codex', 'hooks.json'), 'utf8');
    record(
      results,
      'workspace Codex hooks include bypass-observer-hook.mjs and strict catch-all gate',
      codexHooks.includes('bypass-observer-hook.mjs') && codexHooks.includes('codex-atomic-only-hook.mjs'),
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
