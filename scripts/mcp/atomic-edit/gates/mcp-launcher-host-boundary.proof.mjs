#!/usr/bin/env node
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { removePath, writeText } from './broker-fixture-io.mjs';
import { inheritedBrokerSocketFromState } from './proof-host-env.mjs';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const launcher = path.resolve(sourceDir, '..', 'atomic-edit-mcp-launcher.sh')

const launcherImpl = path.resolve(sourceDir, '..', 'atomic-edit-mcp-launcher-impl.sh');
const launcherSupervisor = path.join(sourceDir, 'launcher-supervisor.mjs');;
const brokerScript = path.join(sourceDir, 'atomic-exec-broker.mjs');
const brokerState = path.join(repoRoot, '.atomic', 'codex-broker-current.json');

function record(results, name, ok, detail) {
  results.push({ name, ok, detail });
}

function launcherSourceAssertions() {
  const bootstrapSource = fs.readFileSync(launcher, 'utf8');
  const implSource = fs.readFileSync(launcherImpl, 'utf8');
  const supervisorSource = fs.readFileSync(launcherSupervisor, 'utf8');
  const source = [bootstrapSource, implSource, supervisorSource].join('\n');
  return {
    definesManifestFresh: source.includes('\nmanifest_fresh() {\n'),
    checksDistFreshnessManifest: source.includes('"${NODE_BIN}" "${SRC_DIR}/dist-freshness.mjs" --check'),
    rebuildsWhenSourceOrManifestStale: source.includes('if needs_build || ! manifest_fresh; then'),
    refusesStillStaleAfterRebuild: source.includes('REFUSED: dist/server.js is stale after rebuild') && source.includes('exit 81'),
    capturesFindErrorsWithoutStdout: source.includes('-newer "${DIST}" -print -quit 2>&1'),
    capturesFreshnessErrorsWithoutStdout: source.includes('freshness_output="$("${NODE_BIN}" "${SRC_DIR}/dist-freshness.mjs" --check 2>&1)"'),
    avoidsSandboxUnsafeDevNull: !source.includes('/dev/null'),
    definesNodeResolver: source.includes('\nresolve_node_bin() {\n'),
    usesResolvedNodeForInlineScripts: source.includes('"${NODE_BIN}" -e'),
    usesResolvedNodeForServerExec: source.includes('exec "${NODE_BIN}" "${DIST}"'),
    preservesCallerWorkspaceRoot:
      source.includes('CALLER_WORKSPACE_ROOT="$(pwd -P)"') &&
      source.includes('export ATOMIC_WORKSPACE_ROOT="${ATOMIC_WORKSPACE_ROOT:-${CALLER_WORKSPACE_ROOT}}"'),
    requiresOptInBrokerStateRecovery:
      source.includes('ATOMIC_RECOVER_HOST_FROM_STATE') &&
      source.includes('if [[ "${ATOMIC_RECOVER_HOST_FROM_STATE:-}" == "1" ]]; then'),
    routesUnhostedCodexMcpThroughHostLauncher:
      source.includes('codex-atomic-host-launcher.mjs') &&
      source.includes('REFUSED: atomic MCP requires the atomic host sandbox boundary') &&
      source.includes('explicit degraded-mode development/CI admission') &&
      !source.includes('host sandbox not available — auto-enabling SELF-HOSTED mode'),
  };
}


function inheritedBrokerSocket() {
  return inheritedBrokerSocketFromState(repoRoot);
}

function startBroker() {
  const brokerDir = path.join(sourceDir, `.proof-broker-${process.pid}-${Date.now()}`);
  const socketPath = pathToFileURL(brokerDir).href;
  const proc = childProcess.spawn(process.execPath, [brokerScript, socketPath], {
    cwd: repoRoot,
    env: { ...process.env, ATOMIC_EXEC_BROKER_ROOT: repoRoot },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  proc.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  proc.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch { /* best effort */ }
      reject(new Error(`broker did not become ready: stdout=${stdout} stderr=${stderr}`));
    }, 5000);
    proc.on('exit', (code) => {
      clearTimeout(deadline);
      if (!stdout.includes('ATOMIC_BROKER_READY')) {
        reject(new Error(`broker exited before ready: code=${code} stdout=${stdout} stderr=${stderr}`));
      }
    });
    const poll = setInterval(() => {
      if (stdout.includes('ATOMIC_BROKER_READY') && fs.existsSync(path.join(brokerDir, 'requests'))) {
        clearTimeout(deadline);
        clearInterval(poll);
        resolve({ proc, socketPath, cleanupPath: brokerDir, stdout, stderr });
      }
    }, 25);
  });
}

async function hostedLauncherStartsMcp(brokerSocket) {
  const transport = new StdioClientTransport({
    command: launcher,
    args: [],
    cwd: repoRoot,
    stderr: 'pipe',
    env: {
      ...process.env,
      ATOMIC_SINGLE_TOOL_CALL: '',
      ATOMIC_SINGLE_TOOL_NAME: '',
      ATOMIC_SINGLE_TOOL_ARGS_JSON: '',
      ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec',
      ATOMIC_HOST_ATOMIC_ONLY: '1',
      ATOMIC_HOST_WRITE_ROOT: repoRoot,
      ATOMIC_EXEC_BROKER_SOCKET: brokerSocket,
      CODEX_PROJECT_DIR: repoRoot,
      TMPDIR: repoRoot,
      TMP: repoRoot,
      TEMP: repoRoot,
    },
  });
  const client = new Client({ name: 'mcp-launcher-host-boundary-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    return { ok: listed.tools?.some((tool) => tool.name === 'atomic_y_certificate') === true, tools: listed.tools?.length ?? 0 };
  } finally {
    try {
      await client.close();
    } catch {
      // best effort
    }
  }
}

async function unhostedLauncherStartsMcp() {
  const previous = fs.existsSync(brokerState) ? fs.readFileSync(brokerState, 'utf8') : null;
  removePath(brokerState);

  const transport = new StdioClientTransport({
    command: launcher,
    args: [],
    cwd: repoRoot,
    stderr: 'pipe',
    env: {
      ...process.env,
      ATOMIC_SINGLE_TOOL_CALL: '',
      ATOMIC_SINGLE_TOOL_NAME: '',
      ATOMIC_SINGLE_TOOL_ARGS_JSON: '',
      ATOMIC_HOST_SANDBOX: '',
      ATOMIC_HOST_ATOMIC_ONLY: '',
      ATOMIC_HOST_WRITE_ROOT: '',
      ATOMIC_EXEC_BROKER_SOCKET: '',
      ATOMIC_EDIT_MCP_SELF_HOSTED: '',
      ATOMIC_EDIT_ALLOW_SELF_HOSTED: '',
      CODEX_PROJECT_DIR: '',
      TMPDIR: '',
      TMP: '',
      TEMP: '',
    },
  });
  const client = new Client({ name: 'mcp-launcher-unhosted-fail-closed-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    return {
      ok: listed.tools?.some((tool) => tool.name === 'atomic_y_certificate') === true,
      mode: 'host-routed',
      tools: listed.tools?.length ?? 0,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: /Connection closed|REFUSED|requires the atomic host sandbox boundary|ATOMIC_EXEC_BROKER_SOCKET/.test(message),
      mode: 'fail-closed',
      error: message,
    };
  } finally {
    try {
      await client.close();
    } catch {
      // best effort
    }
    if (previous === null) removePath(brokerState);
    else writeText(brokerState, previous, 0o600);
  }
}


async function stateFileLauncherStartsMcp(brokerSocket) {
  const previous = fs.existsSync(brokerState) ? fs.readFileSync(brokerState, 'utf8') : null;
  writeText(
    brokerState,
    JSON.stringify(
      {
        agent: 'codex',
        repoRoot,
        socket: brokerSocket,
        codexHome: process.env.CODEX_HOME ?? path.join(process.env.HOME ?? '', '.codex'),
        pid: process.pid,
        createdAt: new Date().toISOString(),
      },
      null,
      2,
    ) + '\n',
    0o600,
  );
  const transport = new StdioClientTransport({
    command: launcher,
    args: [],
    cwd: repoRoot,
    stderr: 'pipe',
    env: {
      ...process.env,
      ATOMIC_SINGLE_TOOL_CALL: '',
      ATOMIC_SINGLE_TOOL_NAME: '',
      ATOMIC_SINGLE_TOOL_ARGS_JSON: '',
      ATOMIC_HOST_SANDBOX: '',
      ATOMIC_HOST_ATOMIC_ONLY: '',
      ATOMIC_HOST_WRITE_ROOT: '',
      ATOMIC_EXEC_BROKER_SOCKET: '',
      ATOMIC_RECOVER_HOST_FROM_STATE: '1',
      CODEX_PROJECT_DIR: '',
      TMPDIR: '',
      TMP: '',
      TEMP: '',
    },
  });
  const client = new Client({ name: 'mcp-launcher-state-recovery-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    return { ok: listed.tools?.some((tool) => tool.name === 'atomic_y_certificate') === true, tools: listed.tools?.length ?? 0 };
  } finally {
    try {
      await client.close();
    } catch {
      // best effort
    }
    if (previous === null) removePath(brokerState);
    else writeText(brokerState, previous, 0o600);
  }
}
function withBrokerStateSuppressed(run) {
  const previous = fs.existsSync(brokerState) ? fs.readFileSync(brokerState, "utf8") : null;
  try {
    removePath(brokerState);
    return run();
  } finally {
    if (previous === null) removePath(brokerState);
    else writeText(brokerState, previous, 0o600);
  }
}

async function main() {
  const results = [];
  const sourceAssertions = launcherSourceAssertions();
  record(
    results,
    "launcher source enforces fresh dist startup without sandbox-unsafe redirects",
    Object.values(sourceAssertions).every((value) => value === true),
    sourceAssertions,
  );

  const inheritedSocketForHost = inheritedBrokerSocket();
  const inHostEnvelope =
    process.env.ATOMIC_HOST_SANDBOX === 'macos-sandbox-exec' &&
    process.env.ATOMIC_HOST_ATOMIC_ONLY === '1' &&
    typeof inheritedSocketForHost === 'string' &&
    inheritedSocketForHost.length > 0;
  if (inHostEnvelope) {
    const writeRoot = process.env.ATOMIC_HOST_WRITE_ROOT
      ? path.resolve(process.env.ATOMIC_HOST_WRITE_ROOT)
      : null;
    let socketReady = false;
    if (inheritedSocketForHost.startsWith('file://')) {
      socketReady = fs.existsSync(path.join(fileURLToPath(inheritedSocketForHost), 'requests'));
    } else {
      try {
        socketReady = fs.statSync(inheritedSocketForHost).isSocket();
      } catch {
        socketReady = false;
      }
    }
    record(
      results,
      'host-envelope live MCP runtime is bootstrapped under the atomic host boundary (positive witness)',
      writeRoot === repoRoot && socketReady === true,
      { writeRoot, repoRoot, socketReady },
    );
    const hostBaseEnv = {
      ...process.env,
      ATOMIC_SINGLE_TOOL_CALL: '',
      ATOMIC_SINGLE_TOOL_NAME: '',
      ATOMIC_SINGLE_TOOL_ARGS_JSON: '',
    };
    const refuse79 = withBrokerStateSuppressed(() =>
      childProcess.spawnSync(launcher, [], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...hostBaseEnv,
          ATOMIC_HOST_SANDBOX: '',
          ATOMIC_HOST_ATOMIC_ONLY: '',
          ATOMIC_HOST_WRITE_ROOT: '',
          ATOMIC_EXEC_BROKER_SOCKET: '',
          ATOMIC_EDIT_MCP_SELF_HOSTED: '1',
        },
      }),
    );
    record(
      results,
      'host-envelope launcher refuses (exit 79) when self-hosted but host marks are absent',
      refuse79.status === 79 && /requires the atomic host sandbox boundary/.test(refuse79.stderr ?? ''),
      { status: refuse79.status, stderr: String(refuse79.stderr ?? '').slice(0, 200) },
    );
    const refuse80 = withBrokerStateSuppressed(() =>
      childProcess.spawnSync(launcher, [], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...hostBaseEnv,
          ATOMIC_HOST_SANDBOX: 'macos-sandbox-exec',
          ATOMIC_HOST_ATOMIC_ONLY: '1',
          ATOMIC_HOST_WRITE_ROOT: repoRoot,
          ATOMIC_EXEC_BROKER_SOCKET: '',
        },
      }),
    );
    record(
      results,
      'host-envelope launcher refuses (exit 80) when host-marked but the broker socket is absent',
      refuse80.status === 80 && /ATOMIC_EXEC_BROKER_SOCKET/.test(refuse80.stderr ?? ''),
      { status: refuse80.status, stderr: String(refuse80.stderr ?? '').slice(0, 200) },
    );
    return { ok: results.every((entry) => entry.ok), results, mode: 'host-envelope-attested' };
  }

  const unhosted = await unhostedLauncherStartsMcp();
  record(results, "unhosted MCP launcher routes through host or refuses fail-closed", unhosted.ok === true, unhosted);

  const noBroker = withBrokerStateSuppressed(() =>
    childProcess.spawnSync(launcher, [], {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 5000,
      env: {
        ...process.env,
        ATOMIC_SINGLE_TOOL_CALL: "",
        ATOMIC_SINGLE_TOOL_NAME: "",
        ATOMIC_SINGLE_TOOL_ARGS_JSON: "",
        ATOMIC_HOST_SANDBOX: "macos-sandbox-exec",
        ATOMIC_HOST_ATOMIC_ONLY: "1",
        ATOMIC_HOST_WRITE_ROOT: repoRoot,
        ATOMIC_EXEC_BROKER_SOCKET: "",
      },
    }),
  );
  record(results, "host-marked MCP launcher is refused without broker socket", noBroker.status === 80 && /ATOMIC_EXEC_BROKER_SOCKET/.test(noBroker.stderr ?? ""), {
    status: noBroker.status,
    stderr: noBroker.stderr,
  });

  let broker;
  const inherited = inheritedBrokerSocket();
  try {
    const brokerSocket = inherited ?? (broker = await startBroker()).socketPath;
    const hosted = await hostedLauncherStartsMcp(brokerSocket);
    record(
      results,
      inherited
        ? 'inherited-broker host-marked MCP launcher starts the Atomic server'
        : 'broker-backed host-marked MCP launcher starts the Atomic server',
      hosted.ok === true,
      { ...hosted, inheritedBroker: Boolean(inherited) },
    );
    const recovered = await stateFileLauncherStartsMcp(brokerSocket);
    record(
      results,
      'broker state file lets MCP launcher recover when Codex does not pass ATOMIC env',
      recovered.ok === true,
      { ...recovered, inheritedBroker: Boolean(inherited) },
    );
  } finally {
    if (!inherited && broker?.proc) {
      try { broker.proc.kill('SIGTERM'); } catch { /* best effort */ }
    }
    if (!inherited && (broker?.cleanupPath || broker?.socketPath)) {
      fs.rmSync(broker.cleanupPath ?? broker.socketPath, { recursive: true, force: true });
    }
  }

  return { ok: results.every((entry) => entry.ok), results };
}


main().then((result) => {
  if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
  else for (const entry of result.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
  process.exit(result.ok ? 0 : 1);
}).catch((error) => {
  process.stderr.write((error instanceof Error ? error.stack ?? error.message : String(error)) + '\n');
  process.exit(1);
});
