#!/usr/bin/env node
import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { childAvailable, childCommands, mcpChildRequest, walk } from './mcp-suite-child-proxy.mjs';
import { postgresTool } from './mcp-suite-postgres.mjs';
import { TOOLSETS } from './mcp-suite-toolsets.mjs';
const ROOT = process.env.MCP_SUITE_ROOT || process.cwd();
const KIND = process.argv[2] || process.env.MCP_SUITE_KIND;
const PROTO_VERSION = '2024-11-05';
const MAX_OUTPUT = 200_000;
if (!KIND) {
  process.stderr.write('missing MCP suite kind\n');
  process.exit(1);
}
const SERVER_INFO = { name: KIND, version: '0.1.0' };

async function callTool(name, args = {}) {
  if (KIND === 'pulse') return pulseTool(name, args);
  if (KIND === 'test-runner') return testRunnerTool(name, args);
  if (KIND === 'task-graph') return taskGraphTool(name, args);
  if (KIND === 'postgres') return postgresTool(name, args, ROOT, runCommand);
  if (KIND === 'kloel-os') return kloelOsTool(name, args);
  throw new Error(`unknown server kind: ${KIND}`);
}
async function pulseTool(name, args) {
  if (name === 'pulse_status') {
    return {
      ok: true,
      root: ROOT,
      runner: existsSync(join(ROOT, 'scripts/pulse/run.js')),
      ciRunner: existsSync(join(ROOT, 'scripts/ops/run-pulse-ci.mjs')),
      lockedAuditor: existsSync(join(ROOT, 'scripts/pulse/no-hardcoded-reality-audit.ts')),
      artifactDirs: artifactDirs().filter((dir) => existsSync(dir)),
    };
  }
  if (name === 'pulse_scan') {
    const mode = args.mode || 'json';
    const commands = {
      json: ['node', 'scripts/pulse/run.js', '--json'],
      report: ['node', 'scripts/pulse/run.js', '--report'],
      certify: ['node', 'scripts/pulse/run.js', '--certify'],
      ci: ['node', 'scripts/ops/run-pulse-ci.mjs'],
      'deep-ci': ['node', 'scripts/ops/run-pulse-deep-ci.mjs'],
      'autonomous-dry': ['node', 'scripts/pulse/run.js', '--autonomous', '--dry-run'],
    };
    return runCommand(commands[mode] || commands.json, { timeoutMs: args.timeoutMs || 120_000 });
  }
  if (name === 'pulse_scan_module') {
    return runCommand(['node', 'scripts/pulse/run.js', '--json', '--module', args.module], {
      timeoutMs: args.timeoutMs || 120_000,
    });
  }
  if (name === 'pulse_report')
    return runCommand(['node', 'scripts/pulse/run.js', '--report'], {
      timeoutMs: args.timeoutMs || 120_000,
    });
  if (name === 'pulse_health_by_module') return pulseArtifactSummary('module');
  if (name === 'pulse_top_gates') return pulseArtifactSummary('gate');
  if (name === 'pulse_history') return { ok: true, artifacts: listPulseArtifacts().slice(0, 200) };
  if (name === 'pulse_dispatch_fix') {
    const dryRun = args.dryRun !== false;
    if (!dryRun && args.confirm !== true) {
      return { ok: false, error: 'non-dry PULSE dispatch requires confirm=true' };
    }
    const cmd = dryRun
      ? ['node', 'scripts/pulse/run.js', '--autonomous', '--dry-run']
      : ['node', 'scripts/pulse/run.js', '--autonomous'];
    return runCommand(cmd, { timeoutMs: args.timeoutMs || 120_000 });
  }
  if (name === 'pulse_mesh_routes') {
    return {
      ok: true,
      routes: [
        'pulse_scan -> task_import_plan -> task_next',
        'pulse_top_gates -> atomic-edit read/edit -> test-runner verify',
        'pulse_dispatch_fix -> kaisser handoff -> task-graph locks',
      ],
    };
  }
  throw new Error(`unknown pulse tool: ${name}`);
}

async function testRunnerTool(name, args) {
  if (name === 'run_tsc')
    return runPackageCommand(args.package || 'all', 'typecheck', args.timeoutMs);
  if (name === 'run_eslint')
    return runPackageCommand(args.package || 'all', 'lint', args.timeoutMs, true);
  if (name === 'run_jest') {
    const cmd = ['npm', '--prefix', 'backend', 'run', 'test', '--', '--runInBand'];
    if (args.testPath) cmd.push(args.testPath);
    return runCommand(cmd, { timeoutMs: args.timeoutMs || 120_000 });
  }
  if (name === 'run_vitest') {
    const pkg = args.package || 'frontend';
    const cmd = ['npm', '--prefix', pkg, 'test'];
    if (args.filter) cmd.push('--', args.filter);
    return runCommand(cmd, { timeoutMs: args.timeoutMs || 120_000 });
  }
  if (name === 'coverage_for_module') {
    const pkg = args.package || 'frontend';
    const script = pkg === 'backend' ? 'test:cov' : 'test:coverage';
    const cmd = ['npm', '--prefix', pkg, 'run', script];
    if (!args.run) return { ok: true, dryRun: true, command: cmd.join(' ') };
    return runCommand(cmd, { timeoutMs: args.timeoutMs || 180_000 });
  }
  if (name === 'affected_tests') return affectedTests(args.files || []);
  if (name === 'test_summary') {
    return {
      ok: true,
      commands: {
        allTypecheck: 'npm run typecheck',
        allLint: 'npm run lint',
        backendJest: 'npm --prefix backend run test -- --runInBand',
        frontendVitest: 'npm --prefix frontend test',
        workerVitest: 'npm --prefix worker test',
      },
    };
  }
  if (name === 'test_mesh_routes') {
    return {
      ok: true,
      routes: [
        'affected_tests -> run_jest/run_vitest',
        'graphify-plus affected_specs -> test-runner',
        'pulse gates -> test-runner verification',
      ],
    };
  }
  throw new Error(`unknown test-runner tool: ${name}`);
}

async function taskGraphTool(name, args) {
  if (name === 'task_import_plan') {
    const tasks = loadTasks();
    const incoming = Array.isArray(args.tasks)
      ? args.tasks
      : tasksFromPlanText(args.planText || '');
    const now = new Date().toISOString();
    const created = incoming.map((task, index) => ({
      id: task.id || `task-${Date.now()}-${index}`,
      title: task.title || String(task).slice(0, 120),
      description: task.description || '',
      status: task.status || 'pending',
      priority: task.priority || 'normal',
      dependsOn: task.dependsOn || [],
      source: args.source || task.source || 'mcp',
      createdAt: now,
      updatedAt: now,
    }));
    saveTasks([...tasks, ...created]);
    return { ok: true, createdCount: created.length, tasks: created };
  }
  if (name === 'task_list') {
    const tasks = loadTasks();
    return {
      ok: true,
      tasks: args.status ? tasks.filter((task) => task.status === args.status) : tasks,
    };
  }
  if (name === 'task_next') {
    const tasks = loadTasks();
    const locks = lockKeys();
    const next = tasks.find(
      (task) => task.status === 'pending' && !locks.has(task.id) && depsDone(task, tasks),
    );
    if (!next) return { ok: true, task: null };
    if (args.claimBy) {
      next.status = 'claimed';
      next.claimedBy = args.claimBy;
      next.updatedAt = new Date().toISOString();
      saveTasks(tasks);
      acquireLock(next.id, args.claimBy, 3_600_000);
    }
    return { ok: true, task: next };
  }
  if (name === 'task_update') {
    const tasks = loadTasks();
    const task = tasks.find((item) => item.id === args.id);
    if (!task) return { ok: false, error: `task not found: ${args.id}` };
    Object.assign(task, args.fields || {});
    if (args.status) task.status = args.status;
    task.updatedAt = new Date().toISOString();
    saveTasks(tasks);
    return { ok: true, task };
  }
  if (name === 'task_lock_acquire')
    return acquireLock(args.key, args.owner, args.ttlMs || 3_600_000);
  if (name === 'task_lock_release') return releaseLock(args.key, args.owner);
  if (name === 'task_stats') {
    const tasks = loadTasks();
    const byStatus = {};
    for (const task of tasks) byStatus[task.status] = (byStatus[task.status] || 0) + 1;
    return { ok: true, total: tasks.length, byStatus, locks: lockKeys().size };
  }
  if (name === 'task_mesh_routes') {
    return {
      ok: true,
      routes: [
        'pulse findings -> task_import_plan',
        'task_next -> kaisser plan/task round',
        'task_lock_acquire -> atomic-edit lock discipline',
      ],
    };
  }
  throw new Error(`unknown task-graph tool: ${name}`);
}

async function kloelOsTool(name, args) {
  if (name === 'os_status') name = 'kloel_os_status';
  if (name === 'kloel_os_status') {
    const include = args.includeToolCounts !== false;
    const commands = childCommands(ROOT);
    const children = {};
    for (const child of Object.keys(commands)) {
      const command = commands[child];
      const available = childAvailable(command);
      const entry = { available, command: command.command, args: command.args };
      if (include && available) {
        const listed = await mcpChildRequest(
          ROOT,
          PROTO_VERSION,
          command,
          'tools/list',
          {},
          args.timeoutMs || 8_000,
        );
        entry.toolCount = listed.ok ? listed.result?.tools?.length || 0 : 0;
        if (!listed.ok) entry.error = listed.error;
      }
      children[child] = entry;
    }
    return { ok: true, root: ROOT, tier: process.env.KLOEL_OS_TIER || 'NAVIGATE', children };
  }
  if (name === 'kloel_os_child_tools') {
    const command = childCommands(ROOT)[args.child];
    if (!command) return { ok: false, error: `unknown child: ${args.child}` };
    const listed = await mcpChildRequest(
      ROOT,
      PROTO_VERSION,
      command,
      'tools/list',
      {},
      args.timeoutMs || 15_000,
    );
    return listed.ok ? { ok: true, child: args.child, tools: listed.result.tools || [] } : listed;
  }
  if (name === 'kloel_os_call_child_tool') {
    const command = childCommands(ROOT)[args.child];
    if (!command) return { ok: false, error: `unknown child: ${args.child}` };
    return mcpChildRequest(
      ROOT,
      PROTO_VERSION,
      command,
      'tools/call',
      { name: args.toolName, arguments: args.arguments || {} },
      args.timeoutMs || 60_000,
    );
  }
  if (name === 'kloel_os_mesh_routes') {
    return {
      ok: true,
      routes: [
        'codebody-navigator -> graphify-plus -> atomic-edit -> test-runner',
        'pulse -> task-graph -> kaisser -> sentry-bridge',
        'saas-compiler -> graphify-plus affected_specs -> test-runner -> kloel_os_governance',
        'postgres -> codebody proof receipts -> pulse runtime evidence',
      ],
    };
  }
  if (name === 'kloel_os_governance') {
    const protectedPath = join(ROOT, 'ops/protected-governance-files.json');
    let protectedFiles = null;
    if (existsSync(protectedPath)) {
      try {
        protectedFiles = JSON.parse(readFileSync(protectedPath, 'utf8'));
      } catch {
        protectedFiles = 'unparseable';
      }
    }
    return {
      ok: true,
      tier: process.env.KLOEL_OS_TIER || 'NAVIGATE',
      protectedConfigPresent: existsSync(protectedPath),
      protectedFiles,
      rules: [
        'no protected governance edits without explicit human approval',
        'no destructive git file restore command',
        'read-only postgres by default',
        'atomic-edit first for code edits',
      ],
    };
  }
  throw new Error(`unknown kloel-os tool: ${name}`);
}

function runPackageCommand(pkg, script, timeoutMs, lintCheck = false) {
  if (pkg === 'all') {
    const rootScript = script === 'typecheck' ? 'typecheck' : 'lint';
    return runCommand(['npm', 'run', rootScript], { timeoutMs: timeoutMs || 180_000 });
  }
  const actualScript = lintCheck && pkg !== 'frontend' ? 'lint:check' : script;
  return runCommand(['npm', '--prefix', pkg, 'run', actualScript], {
    timeoutMs: timeoutMs || 120_000,
  });
}

function runCommand(command, { timeoutMs = 120_000, env = {} } = {}) {
  return new Promise((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command[0], command.slice(1), {
      cwd: ROOT,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolvePromise({
        ok: false,
        timedOut: true,
        exitCode: null,
        command: command.join(' '),
        stdout: stdout.slice(-MAX_OUTPUT),
        stderr: stderr.slice(-MAX_OUTPUT),
      });
    }, timeoutMs);
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolvePromise({
        ok: false,
        exitCode: -1,
        command: command.join(' '),
        stdout: stdout.slice(-MAX_OUTPUT),
        stderr: `${stderr}\n${error.message}`.slice(-MAX_OUTPUT),
      });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolvePromise({
        ok: code === 0,
        exitCode: code,
        command: command.join(' '),
        stdout: stdout.slice(-MAX_OUTPUT),
        stderr: stderr.slice(-MAX_OUTPUT),
      });
    });
  });
}

function affectedTests(files) {
  const stems = files
    .map((file) =>
      file
        .split('/')
        .pop()
        ?.replace(/\.(tsx?|jsx?|mjs|cjs)$/, ''),
    )
    .filter(Boolean);
  const allFiles = walk(ROOT, 16_000).filter((file) => /\.(test|spec)\.(tsx?|jsx?)$/.test(file));
  const matches = allFiles.filter((file) => stems.some((stem) => file.includes(stem)));
  return { ok: true, files, tests: matches.slice(0, 200) };
}

function artifactDirs() {
  return [
    join(ROOT, 'pulse-out'),
    join(ROOT, '.pulse'),
    join(ROOT, 'artifacts/pulse'),
    join(ROOT, 'scripts/pulse/artifacts'),
  ];
}

function listPulseArtifacts() {
  const out = [];
  for (const dir of artifactDirs()) {
    if (!existsSync(dir)) continue;
    for (const file of walk(dir, 300)) out.push(file.replace(`${ROOT}/`, ''));
  }
  return out.sort();
}

function pulseArtifactSummary(kind) {
  const artifacts = listPulseArtifacts();
  const hints = artifacts.filter((file) => new RegExp(kind, 'i').test(file)).slice(0, 50);
  return {
    ok: true,
    kind,
    artifactCount: artifacts.length,
    hints,
    note: hints.length ? undefined : 'No matching artifact names found; run pulse_scan first.',
  };
}

function taskDir() {
  const dir = join(ROOT, '.task-graph');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function tasksPath() {
  return join(taskDir(), 'tasks.json');
}

function locksDir() {
  const dir = join(taskDir(), 'locks');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function loadTasks() {
  if (!existsSync(tasksPath())) return [];
  try {
    return JSON.parse(readFileSync(tasksPath(), 'utf8'));
  } catch (error) {
    process.stderr.write(
      `[mcp-suite:task-graph] failed to read tasks: ${error.message || String(error)}\n`,
    );
    return [];
  }
}

function saveTasks(tasks) {
  writeFileSync(tasksPath(), JSON.stringify(tasks, null, 2));
}

function tasksFromPlanText(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[-*]\s+\[[ x]\]\s*/i, '').trim())
    .filter(Boolean)
    .map((title) => ({ title }));
}

function depsDone(task, tasks) {
  return (task.dependsOn || []).every(
    (id) => tasks.find((item) => item.id === id)?.status === 'done',
  );
}

function lockPath(key) {
  return join(locksDir(), encodeURIComponent(key));
}

function lockKeys() {
  if (!existsSync(locksDir())) return new Set();
  return new Set(readdirSync(locksDir()).map((name) => decodeURIComponent(name)));
}

function acquireLock(key, owner, ttlMs) {
  const path = lockPath(key);
  const now = Date.now();
  if (existsSync(path)) {
    try {
      const current = JSON.parse(readFileSync(path, 'utf8'));
      if (current.expiresAt > now && current.owner !== owner)
        return { ok: false, locked: true, current };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: `lock file is corrupt: ${message}`, key };
    }
  }
  const lock = { key, owner, acquiredAt: new Date(now).toISOString(), expiresAt: now + ttlMs };
  writeFileSync(path, JSON.stringify(lock, null, 2));
  return { ok: true, lock };
}

function releaseLock(key, owner) {
  const path = lockPath(key);
  if (!existsSync(path)) return { ok: true, released: false };
  const lock = JSON.parse(readFileSync(path, 'utf8'));
  if (lock.owner !== owner) return { ok: false, error: 'owner mismatch', lock };
  unlinkSync(path);
  return { ok: true, released: true };
}

async function dispatch(method, params) {
  switch (method) {
    case 'initialize':
      return {
        protocolVersion: PROTO_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      };
    case 'tools/list':
      return { tools: TOOLSETS[KIND] || [] };
    case 'tools/call': {
      const out = await callTool(params.name, params.arguments || {});
      return {
        content: [
          { type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) },
        ],
      };
    }
    case 'ping':
    case 'notifications/initialized':
    case 'shutdown':
      return {};
    case 'exit':
      process.exit(0);
      return {};
    default:
      throw new Error(`method not supported: ${method}`);
  }
}

let input = Buffer.alloc(0);
process.stdin.on('data', (chunk) => {
  input = Buffer.concat([input, chunk]);
  while (true) {
    const headerEnd = input.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      const newline = input.indexOf('\n');
      if (newline === -1) break;
      const line = input.slice(0, newline).toString('utf8').trim();
      input = input.slice(newline + 1);
      if (line) void handleMessage(line);
      continue;
    }
    const header = input.slice(0, headerEnd).toString('utf8');
    const match = /Content-Length: (\d+)/i.exec(header);
    if (!match) {
      input = input.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const total = headerEnd + 4 + length;
    if (input.length < total) break;
    const body = input.slice(headerEnd + 4, total).toString('utf8');
    input = input.slice(total);
    void handleMessage(body);
  }
});

async function handleMessage(text) {
  let request;
  try {
    request = JSON.parse(text);
  } catch (error) {
    send({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: error.message || String(error) },
    });
    return;
  }
  if (request.id === undefined) return;
  try {
    const result = await dispatch(request.method, request.params || {});
    send({ jsonrpc: '2.0', id: request.id, result });
  } catch (error) {
    send({
      jsonrpc: '2.0',
      id: request.id,
      error: { code: -32603, message: error.message || String(error) },
    });
  }
}
function send(message) {
  const json = JSON.stringify(message);
  process.stdout.write(json + '\n');
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
