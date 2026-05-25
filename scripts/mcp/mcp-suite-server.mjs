#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.env.MCP_SUITE_ROOT || process.cwd();
const KIND = process.argv[2] || process.env.MCP_SUITE_KIND;
const PROTO_VERSION = '2024-11-05';
const MAX_OUTPUT = 200_000;

if (!KIND) {
  process.stderr.write('missing MCP suite kind\n');
  process.exit(1);
}

const SERVER_INFO = { name: KIND, version: '0.1.0' };

const TOOLSETS = {
  pulse: [
    tool('pulse_status', 'Report PULSE launcher health and known artifact locations.'),
    tool('pulse_scan', 'Run a PULSE scan mode and return structured command output.', {
      mode: { type: 'string', enum: ['json', 'report', 'certify', 'ci', 'deep-ci', 'autonomous-dry'] },
      timeoutMs: { type: 'number' },
    }),
    tool('pulse_scan_module', 'Run a PULSE JSON scan scoped to a module when the underlying CLI supports it.', {
      module: { type: 'string' },
      timeoutMs: { type: 'number' },
    }, ['module']),
    tool('pulse_report', 'Run the PULSE report command.'),
    tool('pulse_health_by_module', 'Summarize available PULSE module health artifacts.'),
    tool('pulse_top_gates', 'Return recent gate/failure hints from PULSE artifacts when present.'),
    tool('pulse_dispatch_fix', 'Dispatch or dry-run PULSE autonomous remediation.', {
      dryRun: { type: 'boolean' },
      confirm: { type: 'boolean' },
      timeoutMs: { type: 'number' },
    }),
    tool('pulse_history', 'List recent PULSE artifacts generated in this repository.'),
    tool('pulse_mesh_routes', 'Describe how PULSE composes with atomic-edit, test-runner, task-graph, and kaisser.'),
  ],
  'test-runner': [
    tool('run_tsc', 'Run typecheck for all, backend, frontend, or worker.', {
      package: { type: 'string', enum: ['all', 'backend', 'frontend', 'worker'] },
      timeoutMs: { type: 'number' },
    }),
    tool('run_eslint', 'Run lint check for all, backend, frontend, or worker.', {
      package: { type: 'string', enum: ['all', 'backend', 'frontend', 'worker'] },
      timeoutMs: { type: 'number' },
    }),
    tool('run_jest', 'Run backend Jest tests.', {
      testPath: { type: 'string' },
      timeoutMs: { type: 'number' },
    }),
    tool('run_vitest', 'Run frontend or worker Vitest tests.', {
      package: { type: 'string', enum: ['frontend', 'worker'] },
      filter: { type: 'string' },
      timeoutMs: { type: 'number' },
    }),
    tool('coverage_for_module', 'Run or preview the coverage command for a package.', {
      package: { type: 'string', enum: ['backend', 'frontend', 'worker'] },
      run: { type: 'boolean' },
      timeoutMs: { type: 'number' },
    }),
    tool('affected_tests', 'Find likely affected test files from changed/source files.', {
      files: { type: 'array', items: { type: 'string' } },
    }, ['files']),
    tool('test_summary', 'Return the test command inventory exposed by this repo.'),
    tool('test_mesh_routes', 'Describe how test-runner composes with graphify-plus, pulse, and task-graph.'),
  ],
  'task-graph': [
    tool('task_import_plan', 'Import tasks from explicit task objects or plan text.', {
      tasks: { type: 'array', items: { type: 'object' } },
      planText: { type: 'string' },
      source: { type: 'string' },
    }),
    tool('task_list', 'List tasks, optionally filtered by status.', {
      status: { type: 'string' },
    }),
    tool('task_next', 'Return and optionally claim the next ready task.', {
      claimBy: { type: 'string' },
    }),
    tool('task_update', 'Update a task status or fields.', {
      id: { type: 'string' },
      status: { type: 'string' },
      fields: { type: 'object' },
    }, ['id']),
    tool('task_lock_acquire', 'Acquire a persistent lock key for a worker.', {
      key: { type: 'string' },
      owner: { type: 'string' },
      ttlMs: { type: 'number' },
    }, ['key', 'owner']),
    tool('task_lock_release', 'Release a persistent lock key when owner matches.', {
      key: { type: 'string' },
      owner: { type: 'string' },
    }, ['key', 'owner']),
    tool('task_stats', 'Return task and lock counts.'),
    tool('task_mesh_routes', 'Describe how task-graph coordinates PULSE, kaisser, and test-runner.'),
  ],
  postgres: [
    tool('pg_status', 'Report read-only Postgres connection configuration without exposing secrets.'),
    tool('pg_query', 'Run a read-only SELECT/WITH/SHOW query with a row cap.', {
      sql: { type: 'string' },
      limit: { type: 'number' },
      timeoutMs: { type: 'number' },
    }, ['sql']),
    tool('pg_tables', 'List visible public tables.'),
    tool('pg_table_describe', 'Describe columns for a table.', {
      table: { type: 'string' },
      schema: { type: 'string' },
    }, ['table']),
    tool('pg_count', 'Count rows in a table.', {
      table: { type: 'string' },
      schema: { type: 'string' },
    }, ['table']),
    tool('pg_recent', 'Return recent rows ordered by a timestamp column.', {
      table: { type: 'string' },
      schema: { type: 'string' },
      orderBy: { type: 'string' },
      limit: { type: 'number' },
    }, ['table']),
    tool('pg_explain', 'Run EXPLAIN on a read-only query.', {
      sql: { type: 'string' },
      timeoutMs: { type: 'number' },
    }, ['sql']),
    tool('pg_mesh_routes', 'Describe how postgres composes with PULSE, graphify-plus, and codebody.'),
  ],
  'kloel-os': [
    tool('kloel_os_status', 'Report child MCP availability and optional tool counts.', {
      includeToolCounts: { type: 'boolean' },
      timeoutMs: { type: 'number' },
    }),
    tool('os_status', 'Alias for kloel_os_status.', {
      includeToolCounts: { type: 'boolean' },
      timeoutMs: { type: 'number' },
    }),
    tool('kloel_os_child_tools', 'List tools exposed by a child MCP.', {
      child: { type: 'string' },
      timeoutMs: { type: 'number' },
    }, ['child']),
    tool('kloel_os_call_child_tool', 'Call a tool on a child MCP through the Kloel OS proxy.', {
      child: { type: 'string' },
      toolName: { type: 'string' },
      arguments: { type: 'object' },
      timeoutMs: { type: 'number' },
    }, ['child', 'toolName']),
    tool('kloel_os_mesh_routes', 'Return active MCP composition routes for Kloel work.'),
    tool('kloel_os_governance', 'Return protected-surface and tier information without weakening governance.'),
  ],
};

async function callTool(name, args = {}) {
  if (KIND === 'pulse') return pulseTool(name, args);
  if (KIND === 'test-runner') return testRunnerTool(name, args);
  if (KIND === 'task-graph') return taskGraphTool(name, args);
  if (KIND === 'postgres') return postgresTool(name, args);
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
    return runCommand(['node', 'scripts/pulse/run.js', '--json', '--module', args.module], { timeoutMs: args.timeoutMs || 120_000 });
  }
  if (name === 'pulse_report') return runCommand(['node', 'scripts/pulse/run.js', '--report'], { timeoutMs: args.timeoutMs || 120_000 });
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
  if (name === 'run_tsc') return runPackageCommand(args.package || 'all', 'typecheck', args.timeoutMs);
  if (name === 'run_eslint') return runPackageCommand(args.package || 'all', 'lint', args.timeoutMs, true);
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
    return { ok: true, routes: ['affected_tests -> run_jest/run_vitest', 'graphify-plus affected_specs -> test-runner', 'pulse gates -> test-runner verification'] };
  }
  throw new Error(`unknown test-runner tool: ${name}`);
}

async function taskGraphTool(name, args) {
  if (name === 'task_import_plan') {
    const tasks = loadTasks();
    const incoming = Array.isArray(args.tasks) ? args.tasks : tasksFromPlanText(args.planText || '');
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
    return { ok: true, tasks: args.status ? tasks.filter((task) => task.status === args.status) : tasks };
  }
  if (name === 'task_next') {
    const tasks = loadTasks();
    const locks = lockKeys();
    const next = tasks.find((task) => task.status === 'pending' && !locks.has(task.id) && depsDone(task, tasks));
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
  if (name === 'task_lock_acquire') return acquireLock(args.key, args.owner, args.ttlMs || 3_600_000);
  if (name === 'task_lock_release') return releaseLock(args.key, args.owner);
  if (name === 'task_stats') {
    const tasks = loadTasks();
    const byStatus = {};
    for (const task of tasks) byStatus[task.status] = (byStatus[task.status] || 0) + 1;
    return { ok: true, total: tasks.length, byStatus, locks: lockKeys().size };
  }
  if (name === 'task_mesh_routes') {
    return { ok: true, routes: ['pulse findings -> task_import_plan', 'task_next -> kaisser plan/task round', 'task_lock_acquire -> atomic-edit lock discipline'] };
  }
  throw new Error(`unknown task-graph tool: ${name}`);
}

async function postgresTool(name, args) {
  if (name === 'pg_status') {
    const cfg = postgresConfig();
    return { ok: true, configured: !!cfg, psqlAvailable: commandExists('psql'), source: cfg?.source || null, host: cfg?.safe.host || null, database: cfg?.safe.database || null, user: cfg?.safe.user || null };
  }
  if (name === 'pg_query') {
    const sql = capSelect(args.sql, args.limit || 100);
    return runPsql(sql, args.timeoutMs || 30_000);
  }
  if (name === 'pg_tables') {
    return runPsql("select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog','information_schema') order by table_schema, table_name limit 250", 30_000);
  }
  if (name === 'pg_table_describe') {
    const schema = ident(args.schema || 'public');
    const table = ident(args.table);
    return runPsql(`select column_name, data_type, is_nullable from information_schema.columns where table_schema='${schema}' and table_name='${table}' order by ordinal_position`, 30_000);
  }
  if (name === 'pg_count') {
    const schema = ident(args.schema || 'public');
    const table = ident(args.table);
    return runPsql(`select count(*) from "${schema}"."${table}"`, 30_000);
  }
  if (name === 'pg_recent') {
    const schema = ident(args.schema || 'public');
    const table = ident(args.table);
    const orderBy = ident(args.orderBy || 'createdAt');
    const limit = Math.min(Number(args.limit || 25), 100);
    return runPsql(`select * from "${schema}"."${table}" order by "${orderBy}" desc limit ${limit}`, 30_000);
  }
  if (name === 'pg_explain') {
    const sql = assertReadOnly(args.sql);
    return runPsql(`explain ${sql}`, args.timeoutMs || 30_000);
  }
  if (name === 'pg_mesh_routes') {
    return { ok: true, routes: ['pg_tables -> codebody nav_trace_prisma_model', 'pg_query -> runtime proof receipts', 'pg_recent -> sentry/railway incident triage'] };
  }
  throw new Error(`unknown postgres tool: ${name}`);
}

async function kloelOsTool(name, args) {
  if (name === 'os_status') name = 'kloel_os_status';
  if (name === 'kloel_os_status') {
    const include = args.includeToolCounts !== false;
    const children = {};
    for (const child of Object.keys(childCommands())) {
      const command = childCommands()[child];
      const available = childAvailable(command);
      const entry = { available, command: command.command, args: command.args };
      if (include && available) {
        const listed = await mcpChildRequest(command, 'tools/list', {}, args.timeoutMs || 8_000);
        entry.toolCount = listed.ok ? listed.result?.tools?.length || 0 : 0;
        if (!listed.ok) entry.error = listed.error;
      }
      children[child] = entry;
    }
    return { ok: true, root: ROOT, tier: process.env.KLOEL_OS_TIER || 'NAVIGATE', children };
  }
  if (name === 'kloel_os_child_tools') {
    const command = childCommands()[args.child];
    if (!command) return { ok: false, error: `unknown child: ${args.child}` };
    const listed = await mcpChildRequest(command, 'tools/list', {}, args.timeoutMs || 15_000);
    return listed.ok ? { ok: true, child: args.child, tools: listed.result.tools || [] } : listed;
  }
  if (name === 'kloel_os_call_child_tool') {
    const command = childCommands()[args.child];
    if (!command) return { ok: false, error: `unknown child: ${args.child}` };
    return mcpChildRequest(command, 'tools/call', { name: args.toolName, arguments: args.arguments || {} }, args.timeoutMs || 60_000);
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
      try { protectedFiles = JSON.parse(readFileSync(protectedPath, 'utf8')); } catch { protectedFiles = 'unparseable'; }
    }
    return {
      ok: true,
      tier: process.env.KLOEL_OS_TIER || 'NAVIGATE',
      protectedConfigPresent: existsSync(protectedPath),
      protectedFiles,
      rules: ['no protected governance edits without explicit human approval', 'no destructive git file restoration', 'read-only postgres by default', 'atomic-edit first for code edits'],
    };
  }
  throw new Error(`unknown kloel-os tool: ${name}`);
}

function tool(name, description, properties = {}, required = []) {
  return { name, description, inputSchema: { type: 'object', properties, required } };
}

function runPackageCommand(pkg, script, timeoutMs, lintCheck = false) {
  if (pkg === 'all') {
    const rootScript = script === 'typecheck' ? 'typecheck' : 'lint';
    return runCommand(['npm', 'run', rootScript], { timeoutMs: timeoutMs || 180_000 });
  }
  const actualScript = lintCheck && pkg !== 'frontend' ? 'lint:check' : script;
  return runCommand(['npm', '--prefix', pkg, 'run', actualScript], { timeoutMs: timeoutMs || 120_000 });
}

function runCommand(command, { timeoutMs = 120_000, env = {} } = {}) {
  return new Promise((resolvePromise) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(command[0], command.slice(1), { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolvePromise({ ok: false, timedOut: true, exitCode: null, command: command.join(' '), stdout: stdout.slice(-MAX_OUTPUT), stderr: stderr.slice(-MAX_OUTPUT) });
    }, timeoutMs);
    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolvePromise({ ok: false, exitCode: -1, command: command.join(' '), stdout: stdout.slice(-MAX_OUTPUT), stderr: `${stderr}\n${error.message}`.slice(-MAX_OUTPUT) });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolvePromise({ ok: code === 0, exitCode: code, command: command.join(' '), stdout: stdout.slice(-MAX_OUTPUT), stderr: stderr.slice(-MAX_OUTPUT) });
    });
  });
}

function affectedTests(files) {
  const stems = files.map((file) => file.split('/').pop()?.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '')).filter(Boolean);
  const allFiles = walk(ROOT, 16_000).filter((file) => /\.(test|spec)\.(tsx?|jsx?)$/.test(file));
  const matches = allFiles.filter((file) => stems.some((stem) => file.includes(stem)));
  return { ok: true, files, tests: matches.slice(0, 200) };
}

function artifactDirs() {
  return [join(ROOT, 'pulse-out'), join(ROOT, '.pulse'), join(ROOT, 'artifacts/pulse'), join(ROOT, 'scripts/pulse/artifacts')];
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
  return { ok: true, kind, artifactCount: artifacts.length, hints, note: hints.length ? undefined : 'No matching artifact names found; run pulse_scan first.' };
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
  try { return JSON.parse(readFileSync(tasksPath(), 'utf8')); } catch { return []; }
}

function saveTasks(tasks) {
  writeFileSync(tasksPath(), JSON.stringify(tasks, null, 2));
}

function tasksFromPlanText(text) {
  return text.split(/\r?\n/).map((line) => line.replace(/^[-*]\s+\[[ x]\]\s*/i, '').trim()).filter(Boolean).map((title) => ({ title }));
}

function depsDone(task, tasks) {
  return (task.dependsOn || []).every((id) => tasks.find((item) => item.id === id)?.status === 'done');
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
      if (current.expiresAt > now && current.owner !== owner) return { ok: false, locked: true, current };
    } catch { return { ok: false, error: 'lock file is corrupt', key }; }
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

function postgresConfig() {
  const direct = process.env.DATABASE_URL || readEnvValue(join(ROOT, 'backend/.env'), 'DATABASE_URL') || readEnvValue(join(ROOT, '.env'), 'DATABASE_URL');
  if (!direct) return null;
  try {
    const url = new URL(stripQuotes(direct));
    return {
      source: process.env.DATABASE_URL ? 'env' : 'backend/.env',
      env: {
        PGHOST: url.hostname,
        PGPORT: url.port || '5432',
        PGUSER: decodeURIComponent(url.username),
        PGPASSWORD: decodeURIComponent(url.password),
        PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, '')),
        PGSSLMODE: url.searchParams.get('sslmode') || process.env.PGSSLMODE || 'prefer',
      },
      safe: {
        host: url.hostname,
        database: decodeURIComponent(url.pathname.replace(/^\//, '')),
        user: decodeURIComponent(url.username),
      },
    };
  } catch {
    return null;
  }
}

function readEnvValue(file, key) {
  if (!existsSync(file)) return null;
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (line.startsWith(`${key}=`)) return line.slice(key.length + 1);
  }
  return null;
}

function stripQuotes(value) {
  return value.replace(/^['"]|['"]$/g, '');
}

function assertReadOnly(sql) {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  const normalized = trimmed.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (!/^(select|with|show)\b/i.test(normalized)) throw new Error('only SELECT/WITH/SHOW queries are allowed');
  if (/\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|merge)\b/i.test(normalized)) {
    throw new Error('query contains a forbidden write/DDL keyword');
  }
  return trimmed;
}

function capSelect(sql, limit) {
  const checked = assertReadOnly(sql);
  if (/^show\b/i.test(checked)) return checked;
  const capped = Math.min(Number(limit || 100), 100);
  return `select * from (${checked}) as mcp_readonly_query limit ${capped}`;
}

function ident(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value || '')) throw new Error(`invalid SQL identifier: ${value}`);
  return value;
}

function runPsql(sql, timeoutMs) {
  const cfg = postgresConfig();
  if (!cfg) return { ok: false, error: 'DATABASE_URL is not configured' };
  if (!commandExists('psql')) return { ok: false, error: 'psql is not installed or not on PATH' };
  return runCommand(['psql', '-X', '--csv', '--set=ON_ERROR_STOP=1', '-c', sql], { timeoutMs, env: cfg.env });
}

function childCommands() {
  return {
    'atomic-edit': { command: 'bash', args: [join(ROOT, 'scripts/mcp/atomic-edit-mcp-launcher.sh')], transport: 'line' },
    'graphify-plus': { command: 'bash', args: [join(ROOT, 'scripts/mcp/graphify-plus-mcp/launcher.sh')], transport: 'line' },
    'saas-compiler': { command: 'bash', args: [join(ROOT, 'scripts/mcp/saas-compiler-mcp/launcher.sh')], transport: 'line' },
    'codebody-navigator': { command: 'bash', args: [join(ROOT, 'scripts/mcp/codebody-navigator-mcp/launcher.sh')], transport: 'line' },
    kaisser: { command: 'bash', args: [join(ROOT, 'scripts/mcp/kaisser-mcp/launcher.sh')], transport: 'lsp' },
    pulse: { command: 'bash', args: [join(ROOT, 'scripts/mcp/pulse-mcp/launcher.sh')], transport: 'line' },
    'test-runner': { command: 'bash', args: [join(ROOT, 'scripts/mcp/test-runner-mcp/launcher.sh')], transport: 'line' },
    'task-graph': { command: 'bash', args: [join(ROOT, 'scripts/mcp/task-graph-mcp/launcher.sh')], transport: 'line' },
    postgres: { command: 'bash', args: [join(ROOT, 'scripts/mcp/postgres-mcp/launcher.sh')], transport: 'line' },
    'sentry-bridge': { command: 'bash', args: [join(ROOT, 'scripts/mcp/sentry-bridge-mcp/launcher.sh')], transport: 'lsp' },
    mercadopago: { command: 'bash', args: [join(ROOT, 'scripts/mcp/mercadopago-mcp-launcher.sh')], transport: 'line' },
    gitnexus: { command: '/opt/homebrew/bin/gitnexus', args: ['mcp'], transport: 'line' },
    codegraph: { command: 'codegraph', args: ['serve', '--mcp'], transport: 'line' },
  };
}

function childAvailable(command) {
  if (command.command === 'bash') return existsSync(command.args[0]);
  return commandExists(command.command);
}

function mcpChildRequest(command, method, params, timeoutMs) {
  if (!childAvailable(command)) return Promise.resolve({ ok: false, error: 'child command unavailable' });
  return new Promise((resolvePromise) => {
    const child = spawn(command.command, command.args, { cwd: ROOT, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = Buffer.alloc(0);
    let stderr = '';
    let nextId = 1;
    const pending = new Map();
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      resolvePromise({ ok: false, error: `timeout after ${timeoutMs}ms`, stderr: stderr.slice(-20_000) });
    }, timeoutMs);

    function done(value) {
      clearTimeout(timer);
      child.kill('SIGTERM');
      resolvePromise(value);
    }

    function writeMessage(message) {
      const json = JSON.stringify(message);
      if (command.transport === 'lsp') child.stdin.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`);
      else child.stdin.write(`${json}\n`);
    }

    function sendRequest(reqMethod, reqParams) {
      const id = nextId++;
      writeMessage({ jsonrpc: '2.0', id, method: reqMethod, params: reqParams || {} });
      return new Promise((resolveReq, rejectReq) => pending.set(id, { resolveReq, rejectReq }));
    }

    function parseChunk(chunk) {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) {
          const newline = buffer.indexOf('\n');
          if (newline === -1) break;
          const line = buffer.slice(0, newline).toString('utf8').trim();
          buffer = buffer.slice(newline + 1);
          if (line) dispatchMessage(line);
          continue;
        }
        const header = buffer.slice(0, headerEnd).toString('utf8');
        const match = /Content-Length: (\d+)/i.exec(header);
        if (!match) {
          buffer = buffer.slice(headerEnd + 4);
          continue;
        }
        const length = Number(match[1]);
        const total = headerEnd + 4 + length;
        if (buffer.length < total) break;
        const body = buffer.slice(headerEnd + 4, total).toString('utf8');
        buffer = buffer.slice(total);
        dispatchMessage(body);
      }
    }

    function dispatchMessage(text) {
      let message;
      try { message = JSON.parse(text); } catch { return; }
      if (!pending.has(message.id)) return;
      const p = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) p.rejectReq(new Error(message.error.message || JSON.stringify(message.error)));
      else p.resolveReq(message.result);
    }

    child.stdout.on('data', parseChunk);
    child.stderr.on('data', (data) => { stderr += data.toString(); });
    child.on('error', (error) => done({ ok: false, error: error.message, stderr: stderr.slice(-20_000) }));
    child.on('exit', (code) => {
      if (pending.size) done({ ok: false, error: `child exited before response code=${code}`, stderr: stderr.slice(-20_000) });
    });

    (async () => {
      await sendRequest('initialize', { protocolVersion: PROTO_VERSION, capabilities: {}, clientInfo: { name: 'kloel-os-proxy', version: '0.1.0' } });
      writeMessage({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
      const result = await sendRequest(method, params || {});
      done({ ok: true, result });
    })().catch((error) => done({ ok: false, error: error.message, stderr: stderr.slice(-20_000) }));
  });
}

function commandExists(command) {
  const result = spawnSync('sh', ['-lc', `command -v ${shellQuote(command)} >/dev/null 2>&1`], { stdio: 'ignore' });
  return result.status === 0;
}

function walk(start, maxFiles) {
  const out = [];
  const stack = [resolve(start)];
  while (stack.length && out.length < maxFiles) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next') continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else out.push(full);
      if (out.length >= maxFiles) break;
    }
  }
  return out;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

async function dispatch(method, params) {
  switch (method) {
    case 'initialize':
      return { protocolVersion: PROTO_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO };
    case 'tools/list':
      return { tools: TOOLSETS[KIND] || [] };
    case 'tools/call': {
      const out = await callTool(params.name, params.arguments || {});
      return { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }] };
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
  try { request = JSON.parse(text); } catch { return; }
  if (request.id === undefined) return;
  try {
    const result = await dispatch(request.method, request.params || {});
    send({ jsonrpc: '2.0', id: request.id, result });
  } catch (error) {
    send({ jsonrpc: '2.0', id: request.id, error: { code: -32603, message: error.message || String(error) } });
  }
}

function send(message) {
  const json = JSON.stringify(message);
  process.stdout.write(json + '\n');
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
