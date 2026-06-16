#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const mcpLauncher = path.resolve(sourceDir, '..', 'atomic-edit-mcp-launcher.sh');
const hostLauncher = path.join(sourceDir, 'codex-atomic-host-launcher.mjs');
const mcpLauncherSourcePath = path.resolve(sourceDir, '..', 'atomic-edit-mcp-launcher.sh');
const codexConfigPath = path.join(os.homedir(), '.codex', 'config.toml');
const hooksPath = path.join(repoRoot, '.codex', 'hooks.json');
const repoRootReal = fs.realpathSync(repoRoot);
const codexHomeReal = realpathIfPresent(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'));

function realpathIfPresent(value) {
  try {
    return fs.realpathSync(value);
  } catch {
    return path.resolve(value);
  }
}

function record(results, name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail });
}

function readText(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function parseJson(text) {
  try {
    return JSON.parse(text || '{}');
  } catch (error) {
    return { parseError: error instanceof Error ? error.message : String(error), text };
  }
}

function tableBody(toml, tableName) {
  const marker = `[${tableName}]`;
  const start = toml.indexOf(marker);
  if (start < 0) return null;
  const rest = toml.slice(start + marker.length);
  const next = rest.search(/\n\[/);
  return next < 0 ? rest : rest.slice(0, next);
}

function codexConfigContract() {
  const text = readText(codexConfigPath);
  const body = tableBody(text, 'mcp_servers.atomic-edit');
  const timeoutMatch = body?.match(/startup_timeout_sec\s*=\s*([0-9.]+)/);
  const startupTimeout = timeoutMatch ? Number(timeoutMatch[1]) : null;
  const launcherReal = realpathIfPresent(mcpLauncher);
  const configuredLaunchers = [...(body ?? '').matchAll(/"([^"]*atomic-edit-mcp-launcher\.sh)"/g)].map((match) => match[1]);
  const argsUseRepoLauncher = configuredLaunchers.some((value) => realpathIfPresent(value) === launcherReal);
  return {
    codexConfigPath,
    hooksEnabled: /^hooks\s*=\s*true\b/m.test(text),
    tablePresent: body !== null,
    commandIsBash: /command\s*=\s*"(?:[^"]*\/)?bash"/.test(body ?? ''),
    argsUseRepoLauncher,
    configuredLaunchers,
    startupTimeout,
    startupTimeoutEnough: typeof startupTimeout === 'number' && startupTimeout >= 30,
    expectedLauncher: mcpLauncher,
    expectedLauncherReal: launcherReal,
  };
}

function hookContract() {
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(readText(hooksPath));
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }
  const preToolUse = Array.isArray(parsed?.hooks?.PreToolUse) ? parsed.hooks.PreToolUse : [];
  const stop = Array.isArray(parsed?.hooks?.Stop) ? parsed.hooks.Stop : [];
  const catchAll = preToolUse.find((entry) => String(entry?.matcher ?? '') === '.*') ?? null;
  const catchAllCommands = Array.isArray(catchAll?.hooks)
    ? catchAll.hooks.map((hook) => String(hook?.command ?? ''))
    : [];
  const observerIndex = catchAllCommands.findIndex((command) => command.includes('bypass-observer-hook.mjs'));
  const denyIndex = catchAllCommands.findIndex((command) => command.includes('codex-atomic-only-hook.mjs'));
  const stopCommands = stop.flatMap((entry) => Array.isArray(entry?.hooks)
    ? entry.hooks.map((hook) => String(hook?.command ?? ''))
    : []);
  const hasBashAtomicGate = preToolUse.some((entry) =>
    String(entry?.matcher ?? '') === '^Bash$' &&
    Array.isArray(entry?.hooks) &&
    entry.hooks.some((hook) => String(hook?.command ?? '').includes('atomic-only-hook.mjs')),
  );
  const hasApplyPatchAtomicGate = preToolUse.some((entry) =>
    String(entry?.matcher ?? '') === '^apply_patch$' &&
    Array.isArray(entry?.hooks) &&
    entry.hooks.some((hook) => String(hook?.command ?? '').includes('atomic-only-hook.mjs')),
  );
  return {
    hooksPath,
    parseError,
    catchAllPresent: Boolean(catchAll),
    observerIndex,
    denyIndex,
    observerBeforeDeny: observerIndex >= 0 && denyIndex >= 0 && observerIndex < denyIndex,
    stopTraceAudit: stopCommands.some((command) => command.includes('trace-coverage-audit.mjs')),
    hasBashAtomicGate,
    hasApplyPatchAtomicGate,
  };
}

function shellPath(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function liveBrokerSocket(value) {
  const endpoint = typeof value === 'string' ? value.trim() : '';
  if (!endpoint) return '';
  if (endpoint.startsWith('file://')) {
    try {
      const dir = fileURLToPath(endpoint);
      return fs.existsSync(path.join(dir, 'requests')) && fs.existsSync(path.join(dir, 'responses')) ? endpoint : '';
    } catch {
      return '';
    }
  }
  try {
    return fs.statSync(endpoint).isSocket() ? endpoint : '';
  } catch {
    return '';
  }
}

function proofEnv() {
  const hostRoot = process.env.ATOMIC_HOST_WRITE_ROOT
    ? path.resolve(process.env.ATOMIC_HOST_WRITE_ROOT)
    : repoRoot;
  const codexHome = process.env.CODEX_HOME ?? path.join(hostRoot, '.codex');
  const brokerSocket = liveBrokerSocket(process.env.ATOMIC_EXEC_BROKER_SOCKET);
  return {
    ...process.env,
    ATOMIC_BUILD_BROKER: '1',
    ATOMIC_HOST_ATOMIC_ONLY: '1',
    ATOMIC_HOST_SANDBOX: process.env.ATOMIC_HOST_SANDBOX ?? 'macos-sandbox-exec',
    ATOMIC_HOST_WRITE_ROOT: hostRoot,
    ATOMIC_EXEC_BROKER_SOCKET: brokerSocket,
    CODEX_HOME: codexHome,
    CODEX_PROJECT_DIR: hostRoot,
    TMPDIR: sourceDir,
    TMP: sourceDir,
    TEMP: sourceDir,
  };
}

function proofResult(status, stdout, stderr) {
  return {
    status,
    stdout,
    stderr,
    parsed: parseJson(stdout),
  };
}

function runProofDirect(name, timeout, env) {
  const result = childProcess.spawnSync(process.execPath, [path.join(sourceDir, 'gates', name), '--json'], {
    cwd: sourceDir,
    env,
    encoding: 'utf8',
    timeout,
  });
  return proofResult(result.status, result.stdout, result.stderr);
}

function runProofViaBroker(name, timeout, env) {
  const socket = liveBrokerSocket(env.ATOMIC_EXEC_BROKER_SOCKET);
  const client = path.join(env.ATOMIC_HOST_WRITE_ROOT ?? repoRoot, 'scripts/mcp/atomic-edit/atomic-exec-broker-client.mjs');
  const directEnv = socket ? env : { ...env, ATOMIC_EXEC_BROKER_SOCKET: '' };
  if (!socket || !fs.existsSync(client)) {
    return runProofDirect(name, timeout, directEnv);
  }

  const proofPath = path.join(sourceDir, 'gates', name);
  const request = JSON.stringify({
    command: `${shellPath(process.execPath)} ${shellPath(proofPath)} --json`,
    cwd: env.ATOMIC_HOST_WRITE_ROOT ?? repoRoot,
    effectRoot: env.ATOMIC_HOST_WRITE_ROOT ?? repoRoot,
    timeoutMs: timeout,
    env,
  });
  const result = childProcess.spawnSync(process.execPath, [client, socket], {
    cwd: env.ATOMIC_HOST_WRITE_ROOT ?? repoRoot,
    env,
    input: request,
    encoding: 'utf8',
    timeout: timeout + 5000,
  });
  const reply = parseJson(result.stdout);
  if (!reply || typeof reply !== 'object') {
    return proofResult(result.status, result.stdout, result.stderr);
  }

  const stdout = typeof reply.stdout === 'string' ? reply.stdout : '';
  const stderr = typeof reply.stderr === 'string' ? reply.stderr : '';
  const status = typeof reply.exitCode === 'number' ? reply.exitCode : result.status;
  return proofResult(status, stdout, stderr);
}

function runProof(name, timeout = 90000) {
  const env = proofEnv();
  if (env.ATOMIC_EXEC_BROKER_SOCKET && !process.env.ATOMIC_EXEC_BROKER_ROOT) {
    return runProofViaBroker(name, timeout, env);
  }
  return runProofDirect(name, timeout, env);
}

function inspectHostEnv(env, mode) {
  const brokerSocket = env.ATOMIC_EXEC_BROKER_SOCKET ?? '';
  const real = (value) => {
    try {
      return value ? fs.realpathSync(value) : '';
    } catch {
      return '';
    }
  };
  let socketExists = false;
  let socketIsSocket = false;
  let brokerEndpointReady = false;
  let brokerEndpointKind = 'none';
  let socketError = null;
  try {
    if (brokerSocket.startsWith('file://')) {
      const dir = fileURLToPath(brokerSocket);
      const ready = fs.existsSync(path.join(dir, 'requests')) && fs.existsSync(path.join(dir, 'responses'));
      socketExists = ready;
      brokerEndpointReady = ready;
      brokerEndpointKind = 'file';
    } else {
      const stat = fs.statSync(brokerSocket);
      socketExists = true;
      socketIsSocket = stat.isSocket();
      brokerEndpointReady = socketIsSocket;
      brokerEndpointKind = 'socket';
    }
  } catch (error) {
    socketError = error instanceof Error ? error.message : String(error);
  }
  return {
    mode,
    agent: env.ATOMIC_HOST_AGENT ?? '',
    hostSandbox: env.ATOMIC_HOST_SANDBOX ?? '',
    atomicOnly: env.ATOMIC_HOST_ATOMIC_ONLY ?? '',
    writeRootReal: real(env.ATOMIC_HOST_WRITE_ROOT ?? ''),
    codexHomeReal: real(env.CODEX_HOME ?? ''),
    codexProjectDirReal: real(env.CODEX_PROJECT_DIR ?? ''),
    tmpdirReal: real(env.TMPDIR ?? ''),
    tmpReal: real(env.TMP ?? ''),
    tempReal: real(env.TEMP ?? ''),
    brokerSocket,
    socketExists,
    socketIsSocket,
    brokerEndpointReady,
    brokerEndpointKind,
    socketError,
  };
}

function pathInsideRepo(realPath) {
  return realPath === repoRootReal || (typeof realPath === 'string' && realPath.startsWith(repoRootReal + path.sep));
}

function hostEnvOk(detail) {
  const base =
    detail.hostSandbox === 'macos-sandbox-exec' &&
    detail.atomicOnly === '1' &&
    detail.writeRootReal === repoRootReal &&
    detail.brokerEndpointReady === true;
  // The Claude launcher (claude-atomic-host-launcher.mjs) is a first-class atomic
  // host: it sets the host markers (ATOMIC_HOST_SANDBOX / ATOMIC_HOST_ATOMIC_ONLY /
  // ATOMIC_HOST_WRITE_ROOT), runs the out-of-sandbox broker, and confines
  // file-writes to repo+TMPDIR+~/.claude. Unlike the codex launcher it does NOT
  // pin codex-only project/home/temp vars (Claude has no CODEX_HOME), so for a
  // claude host the contract is the host-boundary essentials, NOT the codex env.
  // This generalization ADDS an equally-enforced claude branch; the codex branch
  // below stays exactly as strict on identity and allows broker-invoked proof
  // temp roots only when they remain inside the same repo write boundary.
  if (detail.agent === 'claude') {
    return base;
  }
  return (
    base &&
    detail.codexHomeReal === codexHomeReal &&
    detail.codexProjectDirReal === repoRootReal &&
    pathInsideRepo(detail.tmpdirReal) &&
    pathInsideRepo(detail.tmpReal) &&
    pathInsideRepo(detail.tempReal)
  );
}

function staticLauncherContract() {
  const hostSource = readText(hostLauncher);
  const mcpSource = [
    readText(mcpLauncherSourcePath),
    readText(path.resolve(sourceDir, '..', 'atomic-edit-mcp-launcher-impl.sh')),
  ].join('\n');
  return {
    hostLauncher,
    mcpLauncher: mcpLauncherSourcePath,
    hostExportsAtomicEnv:
      hostSource.includes("ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec'") &&
      hostSource.includes("ATOMIC_HOST_ATOMIC_ONLY: '1'") &&
      hostSource.includes('ATOMIC_EXEC_BROKER_SOCKET: brokerSocket') &&
      hostSource.includes('CODEX_HOME: codexHome') &&
      hostSource.includes('CODEX_PROJECT_DIR: repoRoot'),
    hostPinsTempRoots:
      hostSource.includes('TMPDIR: repoRoot') &&
      hostSource.includes('TMP: repoRoot') &&
      hostSource.includes('TEMP: repoRoot'),
    hostAllowsCodexRuntimeState:
      hostSource.includes('function codexRuntimeWriteRules') &&
      hostSource.includes('subpathWriteRule(codexHome)'),
    hostAllowsInteractiveTty:
      hostSource.includes('^/dev/tty.*'),
    hostAllowsCodexRuntimeSockets:
      hostSource.includes('function codexRuntimeNetworkRules') &&
      hostSource.includes('network-bind') &&
      hostSource.includes('network-outbound'),
    hostNormalizesBareCodex:
      hostSource.includes('const REAL_CODEX') &&
      hostSource.includes('function normalizeAgentCommand') &&
      hostSource.includes("command[0] === 'codex'"),
    hostAllowsCodexOutboundNetwork:
      hostSource.includes("'(deny default)'") &&
      hostSource.includes('allow network-outbound') &&
      !hostSource.includes('(allow network*)'),
    hostStartsBroker: hostSource.includes('atomic-exec-broker.mjs') && hostSource.includes('startBroker()'),
    mcpRefusesUnhosted:
      mcpSource.includes('requires the atomic host sandbox boundary') &&
      mcpSource.includes('ATOMIC_EXEC_BROKER_SOCKET'),
  };
}

function hostBoundaryContract() {
  const agent = process.env.ATOMIC_HOST_AGENT ?? '';
  const hasInheritedHostMarkers =
    (agent === 'codex' || agent === 'claude') &&
    process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' &&
    process.env.ATOMIC_HOST_ATOMIC_ONLY === '1';
  const inherited = hasInheritedHostMarkers ? inspectHostEnv(process.env, 'inherited') : null;
  if (inherited && hostEnvOk(inherited)) {
    return { ok: true, live: true, detail: inherited };
  }
  const statik = staticLauncherContract();
  const ok = statik.hostExportsAtomicEnv &&
    statik.hostPinsTempRoots &&
    statik.hostAllowsCodexRuntimeState &&
    statik.hostAllowsInteractiveTty &&
    statik.hostAllowsCodexRuntimeSockets &&
    statik.hostNormalizesBareCodex &&
    statik.hostAllowsCodexOutboundNetwork &&
    statik.hostStartsBroker &&
    statik.mcpRefusesUnhosted;
  return { ok, live: false, detail: inherited ? { ...statik, ignoredStaleInheritedHost: inherited } : statik };
}

function main() {
  const results = [];
  const config = codexConfigContract();
  record(
    results,
    'Codex global config points atomic-edit MCP at the guarded repo launcher',
    config.hooksEnabled && config.tablePresent && config.commandIsBash && config.argsUseRepoLauncher && config.startupTimeoutEnough,
    config,
  );

  const hooks = hookContract();
  record(
    results,
    'Workspace Codex hooks run bypass observer before strict deny and keep Stop trace audit wired',
    !hooks.parseError && hooks.catchAllPresent && hooks.observerBeforeDeny && hooks.stopTraceAudit && hooks.hasBashAtomicGate && hooks.hasApplyPatchAtomicGate,
    hooks,
  );

  const noBypass = runProof('no-bypass-static-policy.proof.mjs');
  const noBypassResults = Array.isArray(noBypass.parsed?.results) ? noBypass.parsed.results : [];
  record(
    results,
    'Static no-bypass policy proof passes for representative native tools',
    noBypass.status === 0 && noBypass.parsed?.ok === true,
    {
      status: noBypass.status,
      parsedOk: noBypass.parsed?.ok === true,
      resultCount: noBypassResults.length,
      failedResults: noBypassResults.filter((entry) => entry?.ok !== true),
      stderr: String(noBypass.stderr ?? '').slice(0, 1000),
    },
  );

  const hostContract = hostBoundaryContract();
  record(
    results,
    'Codex host entrypoint is either live in atomic-only mode or statically fail-closed to that mode',
    hostContract.ok,
    hostContract,
  );

  return { ok: results.every((entry) => entry.ok), results };
}

const payload = main();
if (jsonMode) process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
else for (const entry of payload.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(payload.ok ? 0 : 1);
