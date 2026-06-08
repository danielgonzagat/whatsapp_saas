#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const audit = path.join(sourceDir, 'trace-coverage-audit.mjs');
const socketPath = path.join(sourceDir, `.proof-host-boundary-${process.pid}-${Date.now()}.sock`);

function record(results, name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateCodexStopOutput(value) {
  if (!isPlainObject(value)) return { ok: false, reason: 'Stop output is not an object' };

  const allowedKeys = new Set(['decision', 'reason', 'hookSpecificOutput', 'stopReason', 'suppressOutput', 'systemMessage']);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    return { ok: false, reason: `unexpected Stop output top-level keys: ${unknownKeys.join(', ')}` };
  }

  if (value.decision !== undefined && value.decision !== 'block') {
    return { ok: false, reason: `unsupported Stop decision: ${String(value.decision)}` };
  }
  if (value.decision === 'block' && (typeof value.reason !== 'string' || value.reason.trim().length === 0)) {
    return { ok: false, reason: 'Stop decision:block requires a non-empty reason' };
  }
  if (value.reason !== undefined && typeof value.reason !== 'string') {
    return { ok: false, reason: 'Stop reason must be a string when present' };
  }
  if (value.stopReason !== undefined && typeof value.stopReason !== 'string') {
    return { ok: false, reason: 'Stop stopReason must be a string when present' };
  }
  if (value.systemMessage !== undefined && typeof value.systemMessage !== 'string') {
    return { ok: false, reason: 'Stop systemMessage must be a string when present' };
  }

  if (value.hookSpecificOutput !== undefined) {
    if (!isPlainObject(value.hookSpecificOutput)) {
      return { ok: false, reason: 'Stop hookSpecificOutput must be an object when present' };
    }
    const allowedHookSpecificKeys = new Set(['hookEventName', 'additionalContext']);
    const unknownHookSpecificKeys = Object.keys(value.hookSpecificOutput).filter(
      (key) => !allowedHookSpecificKeys.has(key),
    );
    if (unknownHookSpecificKeys.length > 0) {
      return {
        ok: false,
        reason: `unexpected Stop hookSpecificOutput keys: ${unknownHookSpecificKeys.join(', ')}`,
      };
    }
    if (value.hookSpecificOutput.hookEventName !== 'Stop') {
      return { ok: false, reason: 'Stop hookSpecificOutput.hookEventName must be Stop' };
    }
    if (
      value.hookSpecificOutput.additionalContext !== undefined &&
      typeof value.hookSpecificOutput.additionalContext !== 'string'
    ) {
      return { ok: false, reason: 'Stop hookSpecificOutput.additionalContext must be a string when present' };
    }
  }

  const validationOk = isPlainObject(value);
  return { ok: validationOk };
}

function runAudit(env, args = ['--json']) {
  const result = childProcess.spawnSync(process.execPath, [audit, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, ...env },
  });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout || '{}');
  } catch (error) {
    parsed = { parseError: error instanceof Error ? error.message : String(error), stdout: result.stdout };
  }
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, parsed };
}

function withSocket(fn) {
  return new Promise((resolve, reject) => {
    fs.rmSync(socketPath, { force: true });
    const server = net.createServer((socket) => socket.end());
    server.on('error', reject);
    server.listen(socketPath, async () => {
      try {
        resolve(await fn());
      } catch (error) {
        reject(error);
      } finally {
        server.close();
        fs.rmSync(socketPath, { force: true });
      }
    });
  });
}

function readCodexHooksList(cwd) {
  return new Promise((resolve) => {
    const codex = process.env.CODEX_BIN || '/opt/homebrew/bin/codex';
    const child = childProcess.spawn(codex, ['app-server', '--stdio'], {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buffer = '';
    let stderr = '';
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      resolve({ ok: false, reason: 'timed out waiting for codex app-server hooks/list', stderr });
    }, 10000);

    function finish(payload) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.stdin.end();
      resolve(payload);
    }

    function send(payload) {
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    }

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      finish({ ok: false, reason: error instanceof Error ? error.message : String(error), stderr });
    });
    child.on('close', (code) => {
      if (!settled) finish({ ok: false, reason: `codex app-server exited before hooks/list with code ${code}`, stderr });
    });
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      for (;;) {
        const idx = buffer.indexOf('\n');
        if (idx < 0) break;
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);
        if (!line) continue;
        let message = null;
        try {
          message = JSON.parse(line);
        } catch (error) {
          stderr += `\nhooks/list JSON parse error: ${error instanceof Error ? error.message : String(error)}`;
          continue;
        }
        if (message.id === 1) {
          send({ id: 2, method: 'hooks/list', params: { cwds: [cwd] } });
        } else if (message.id === 2) {
          finish({ ok: true, response: message.result, stderr });
        }
      }
    });

    send({
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: { name: 'atomic-trace-coverage-proof', version: '0' },
        capabilities: { experimentalApi: true },
      },
    });
  });
}

function runCodexStopHookCommand(command, cwd, key) {
  const payload = {
    hook_event_name: 'Stop',
    session_id: `trace-coverage-proof-${process.pid}`,
    transcript_path: path.join(cwd, '.atomic', 'trace-coverage-proof-transcript.jsonl'),
    cwd,
  };
  const run = childProcess.spawnSync('sh', ['-c', String(command)], {
    cwd,
    encoding: 'utf8',
    input: `${JSON.stringify(payload)}\n`,
    timeout: 10000,
    env: { ...process.env, CODEX_PROJECT_DIR: cwd },
  });
  let parsed = null;
  try {
    parsed = JSON.parse(run.stdout || '{}');
  } catch (error) {
    parsed = { parseError: error instanceof Error ? error.message : String(error), stdout: run.stdout };
  }
  const validation = validateCodexStopOutput(parsed);
  return {
    key,
    command,
    status: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
    parsed,
    validation,
    empty: parsed !== null && !parsed.parseError && Object.keys(parsed).length === 0,
  };
}

async function main() {
  const results = [];
  const unhostedEnv = {
    ATOMIC_HOST_SANDBOX: '',
    ATOMIC_HOST_ATOMIC_ONLY: '',
    ATOMIC_HOST_WRITE_ROOT: '',
    ATOMIC_EXEC_BROKER_SOCKET: '',
    TMPDIR: '',
    TMP: '',
    TEMP: '',
  };
  const unhosted = runAudit(unhostedEnv);
  record(
    results,
    'trace coverage audit reports missing active host boundary without failing advisory mode',
    unhosted.status === 0 && unhosted.parsed?.hostBoundary?.pass === false && unhosted.parsed?.hostBoundary?.active === false,
    unhosted,
  );

  const strictUnhosted = runAudit(unhostedEnv, ['--json', '--strict-host-boundary']);
  record(
    results,
    'trace coverage audit hard-fails missing host boundary in strict host mode',
    strictUnhosted.status === 1 && strictUnhosted.parsed?.hostBoundary?.pass === false,
    strictUnhosted,
  );

  await withSocket(async () => {
    const hostedEnv = {
      ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec',
      ATOMIC_HOST_ATOMIC_ONLY: '1',
      ATOMIC_HOST_WRITE_ROOT: repoRoot,
      ATOMIC_EXEC_BROKER_SOCKET: socketPath,
      TMPDIR: repoRoot,
      TMP: repoRoot,
      TEMP: repoRoot,
    };
    const hosted = runAudit(hostedEnv);
    record(
      results,
      'trace coverage audit recognizes a complete active host boundary witness',
      hosted.status === 0 &&
        hosted.parsed?.hostBoundary?.pass === true &&
        hosted.parsed?.hostBoundary?.writeRootMatchesRepo === true &&
        hosted.parsed?.hostBoundary?.tempPinnedToRepo === true &&
        hosted.parsed?.hostBoundary?.brokerSocketIsSocket === true,
      hosted,
    );
  });

  const hooks = fs.readFileSync(path.join(repoRoot, '.codex', 'hooks.json'), 'utf8');
  const hookConfig = JSON.parse(hooks);
  const stopCommand = String(hookConfig?.hooks?.Stop?.[0]?.hooks?.[0]?.command ?? '');
  const stopCommandArgs = stopCommand.split(/\s+/).filter(Boolean);
  record(
    results,
    'workspace Stop hook invokes trace-coverage-audit.mjs in Codex Stop JSON mode',
    stopCommand.includes('trace-coverage-audit.mjs') &&
      stopCommandArgs.includes('--codex-stop-json') &&
      !stopCommandArgs.includes('--json'),
    { stopCommand },
  );

  const stopRun = childProcess.spawnSync('sh', ['-c', stopCommand], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 10000,
    env: { ...process.env, CODEX_PROJECT_DIR: repoRoot },
  });
  let stopParsed = null;
  try {
    stopParsed = JSON.parse(stopRun.stdout || '{}');
  } catch (error) {
    stopParsed = { parseError: error instanceof Error ? error.message : String(error), stdout: stopRun.stdout };
  }
  const stopValidation = validateCodexStopOutput(stopParsed);
  record(
    results,
    'workspace Stop hook command emits Codex-valid Stop JSON envelope',
    stopRun.status === 0 && stopParsed !== null && !stopParsed.parseError && stopValidation.ok,
    { status: stopRun.status, stdout: stopRun.stdout, stderr: stopRun.stderr, parsed: stopParsed, stopValidation },
  );

  const legacyStopRun = childProcess.spawnSync(process.execPath, [audit, '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    input: `${JSON.stringify({ hook_event_name: 'Stop', cwd: repoRoot, session_id: 'proof-legacy-json-stop' })}\n`,
    timeout: 10000,
    env: { ...process.env, CODEX_PROJECT_DIR: repoRoot },
  });
  let legacyStopParsed = null;
  try {
    legacyStopParsed = JSON.parse(legacyStopRun.stdout || '{}');
  } catch (error) {
    legacyStopParsed = {
      parseError: error instanceof Error ? error.message : String(error),
      stdout: legacyStopRun.stdout,
    };
  }
  const legacyStopValidation = validateCodexStopOutput(legacyStopParsed);
  record(
    results,
    'legacy --json Stop hook payload emits conservative empty Stop JSON envelope',
    legacyStopRun.status === 0 &&
      legacyStopParsed !== null &&
      !legacyStopParsed.parseError &&
      legacyStopValidation.ok &&
      Object.keys(legacyStopParsed).length === 0,
    {
      status: legacyStopRun.status,
      stdout: legacyStopRun.stdout,
      stderr: legacyStopRun.stderr,
      parsed: legacyStopParsed,
      legacyStopValidation,
    },
  );

  const latestReportPath = path.join(repoRoot, '.atomic', 'trace-coverage-stop.latest.json');
  let latestReport = null;
  try {
    latestReport = JSON.parse(fs.readFileSync(latestReportPath, 'utf8'));
  } catch (error) {
    latestReport = { parseError: error instanceof Error ? error.message : String(error) };
  }
  record(
    results,
    'workspace Stop hook persists raw trace report outside hook stdout',
    isPlainObject(latestReport?.report) &&
      Number.isInteger(latestReport.report.changedCodeFiles) &&
      !Object.prototype.hasOwnProperty.call(stopParsed, 'changedCodeFiles'),
    { latestReportPath, latestReport },
  );

  const hooksList = await readCodexHooksList(repoRoot);
  const hooksEntry = hooksList.response?.data?.find((entry) => entry.cwd === repoRoot);
  const appServerHooks = Array.isArray(hooksEntry?.hooks) ? hooksEntry.hooks : [];
  const projectStopHook = appServerHooks.find((hook) => hook.key === `${repoRoot}/.codex/hooks.json:stop:0:0`);
  const inactiveHooks = appServerHooks.filter((hook) => hook.enabled !== true || hook.trustStatus !== 'trusted');
  record(
    results,
    'Codex app-server sees every Kloel hook enabled and trusted, including project Stop',
    hooksList.ok &&
      appServerHooks.length > 0 &&
      inactiveHooks.length === 0 &&
      projectStopHook?.enabled === true &&
      projectStopHook?.trustStatus === 'trusted' &&
      projectStopHook?.command === stopCommand,
    { hooksList, projectStopHook, inactiveHooks },
  );

  const activeStopHooks = appServerHooks.filter(
    (hook) => hook.enabled === true && hook.trustStatus === 'trusted' && String(hook.key ?? '').includes(':stop:'),
  );
  const activeStopRuns = activeStopHooks.map((hook) => runCodexStopHookCommand(hook.command, repoRoot, hook.key));
  record(
    results,
    'every active Codex Stop hook emits conservative empty Codex-valid JSON',
    activeStopHooks.length > 0 &&
      activeStopRuns.every((run) => run.status === 0 && run.validation.ok && run.empty === true),
    { activeStopRuns },
  );

  return { ok: results.every((entry) => entry.ok), results };
}

main().then((payload) => {
  if (jsonMode) process.stdout.write(JSON.stringify(payload) + '\n');
  else for (const entry of payload.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
  process.exit(payload.ok ? 0 : 1);
}).catch((error) => {
  const payload = { ok: false, error: error instanceof Error ? error.message : String(error) };
  if (jsonMode) process.stdout.write(JSON.stringify(payload) + '\n');
  else process.stderr.write(payload.error + '\n');
  process.exit(1);
});
