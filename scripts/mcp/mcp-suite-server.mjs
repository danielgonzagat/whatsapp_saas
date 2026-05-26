#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = process.env.MCP_SUITE_ROOT || process.cwd();
const KIND = process.argv[2] || process.env.MCP_SUITE_KIND;
const PROTO = '2024-11-05';
const MAX = 200_000;
if (!KIND) {
  process.stderr.write('missing MCP suite kind\n');
  process.exit(1);
}
const s = { string: { type: 'string' }, number: { type: 'number' }, boolean: { type: 'boolean' }, object: { type: 'object' } };
const arr = (items) => ({ type: 'array', items });
const oneOf = (values) => ({ type: 'string', enum: values });
const tool = ([name, description, properties = {}, required = []]) => ({ name, description, inputSchema: { type: 'object', properties, required } });
const TOOLS = Object.fromEntries(Object.entries({
  pulse: [
    ['pulse_status', 'Report PULSE launcher health and artifact locations.'],
    ['pulse_scan', 'Run a PULSE scan mode.', { mode: oneOf(['json', 'report', 'certify', 'ci', 'deep-ci', 'autonomous-dry']), timeoutMs: s.number }],
    ['pulse_scan_module', 'Run a PULSE JSON scan scoped to a module.', { module: s.string, timeoutMs: s.number }, ['module']],
    ['pulse_report', 'Run the PULSE report command.'],
    ['pulse_health_by_module', 'Summarize available PULSE module health artifacts.'],
    ['pulse_top_gates', 'Return recent gate or failure hints from PULSE artifacts.'],
    ['pulse_dispatch_fix', 'Dispatch or dry-run PULSE autonomous remediation.', { dryRun: s.boolean, confirm: s.boolean, timeoutMs: s.number }],
    ['pulse_history', 'List recent PULSE artifacts.'],
    ['pulse_mesh_routes', 'Describe PULSE composition routes.'],
  ],
  'test-runner': [
    ['run_tsc', 'Run typecheck for all, backend, frontend, or worker.', { package: oneOf(['all', 'backend', 'frontend', 'worker']), timeoutMs: s.number }],
    ['run_eslint', 'Run lint for all, backend, frontend, or worker.', { package: oneOf(['all', 'backend', 'frontend', 'worker']), timeoutMs: s.number }],
    ['run_jest', 'Run backend Jest tests.', { testPath: s.string, timeoutMs: s.number }],
    ['run_vitest', 'Run frontend or worker Vitest tests.', { package: oneOf(['frontend', 'worker']), filter: s.string, timeoutMs: s.number }],
    ['coverage_for_module', 'Run or preview coverage for a package.', { package: oneOf(['backend', 'frontend', 'worker']), run: s.boolean, timeoutMs: s.number }],
    ['affected_tests', 'Find likely affected test files from source files.', { files: arr(s.string) }, ['files']],
    ['test_summary', 'Return test command inventory.'],
    ['test_mesh_routes', 'Describe test-runner composition routes.'],
  ],
  'task-graph': [
    ['task_import_plan', 'Import tasks from task objects or plan text.', { tasks: arr(s.object), planText: s.string, source: s.string }],
    ['task_list', 'List tasks, optionally filtered by status.', { status: s.string }],
    ['task_next', 'Return and optionally claim the next ready task.', { claimBy: s.string }],
    ['task_update', 'Update task status or fields.', { id: s.string, status: s.string, fields: s.object }, ['id']],
    ['task_lock_acquire', 'Acquire a persistent lock key.', { key: s.string, owner: s.string, ttlMs: s.number }, ['key', 'owner']],
    ['task_lock_release', 'Release a persistent lock key when owner matches.', { key: s.string, owner: s.string }, ['key', 'owner']],
    ['task_stats', 'Return task and lock counts.'],
    ['task_mesh_routes', 'Describe task-graph composition routes.'],
  ],
  postgres: [
    ['pg_status', 'Report read-only Postgres connection config without secrets.'],
    ['pg_query', 'Run a read-only SELECT/WITH/SHOW query with a row cap.', { sql: s.string, limit: s.number, timeoutMs: s.number }, ['sql']],
    ['pg_tables', 'List visible public tables.'],
    ['pg_table_describe', 'Describe columns for a table.', { table: s.string, schema: s.string }, ['table']],
    ['pg_count', 'Count rows in a table.', { table: s.string, schema: s.string }, ['table']],
    ['pg_recent', 'Return recent rows ordered by a timestamp column.', { table: s.string, schema: s.string, orderBy: s.string, limit: s.number }, ['table']],
    ['pg_explain', 'Run EXPLAIN on a read-only query.', { sql: s.string, timeoutMs: s.number }, ['sql']],
    ['pg_mesh_routes', 'Describe postgres composition routes.'],
  ],
  'kloel-os': [
    ['kloel_os_status', 'Report child MCP availability and optional tool counts.', { includeToolCounts: s.boolean, timeoutMs: s.number }],
    ['os_status', 'Alias for kloel_os_status.', { includeToolCounts: s.boolean, timeoutMs: s.number }],
    ['kloel_os_child_tools', 'List tools exposed by a child MCP.', { child: s.string, timeoutMs: s.number }, ['child']],
    ['kloel_os_call_child_tool', 'Call a child MCP tool through Kloel OS.', { child: s.string, toolName: s.string, arguments: s.object, timeoutMs: s.number }, ['child', 'toolName']],
    ['kloel_os_mesh_routes', 'Return active MCP composition routes for Kloel work.'],
    ['kloel_os_governance', 'Return protected-surface and tier information.'],
  ],
}).map(([key, defs]) => [key, defs.map(tool)]));

async function callTool(name, args = {}) {
  return ({ pulse: pulseTool, 'test-runner': testTool, 'task-graph': taskTool, postgres: pgTool, 'kloel-os': osTool }[KIND] || unknownKind)(name, args);
}
function unknownKind() { throw new Error(`unknown server kind: ${KIND}`); }
function okResult(fields = {}) {
  return {
    ok: true,
    ...fields,
  };
}
function exitCleanly() {
  process.exitCode = 0;
  process.exit();
}
function isBenignReadError(error) {
  return ['ENOENT', 'ENOTDIR', 'EACCES', 'EPERM'].includes(error?.code);
}
async function pulseTool(name, a) {
  if (name === 'pulse_status') {
    return okResult({ root: ROOT, runner: ex('scripts/pulse/run.js'), ciRunner: ex('scripts/ops/run-pulse-ci.mjs'), lockedAuditor: ex('scripts/pulse/no-hardcoded-reality-audit.ts'), artifactDirs: artifactDirs().filter(ex) });
  }
  if (name === 'pulse_scan') {
    const modes = { json: ['node', 'scripts/pulse/run.js', '--json'], report: ['node', 'scripts/pulse/run.js', '--report'], certify: ['node', 'scripts/pulse/run.js', '--certify'], ci: ['node', 'scripts/ops/run-pulse-ci.mjs'], 'deep-ci': ['node', 'scripts/ops/run-pulse-deep-ci.mjs'], 'autonomous-dry': ['node', 'scripts/pulse/run.js', '--autonomous', '--dry-run'] };
    return cmd(modes[a.mode] || modes.json, a.timeoutMs || 120_000);
  }
  if (name === 'pulse_scan_module') return cmd(['node', 'scripts/pulse/run.js', '--json', '--module', a.module], a.timeoutMs || 120_000);
  if (name === 'pulse_report') return cmd(['node', 'scripts/pulse/run.js', '--report'], a.timeoutMs || 120_000);
  if (name === 'pulse_health_by_module') return pulseSummary('module');
  if (name === 'pulse_top_gates') return pulseSummary('gate');
  if (name === 'pulse_history') return okResult({ artifacts: pulseArtifacts().slice(0, 200) });
  if (name === 'pulse_dispatch_fix') {
    const dry = a.dryRun !== false;
    if (!dry && a.confirm !== true) return { ok: false, error: 'non-dry PULSE dispatch requires confirm=true' };
    return cmd(['node', 'scripts/pulse/run.js', '--autonomous', ...(dry ? ['--dry-run'] : [])], a.timeoutMs || 120_000);
  }
  if (name === 'pulse_mesh_routes') return routes(['pulse_scan -> task_import_plan -> task_next', 'pulse_top_gates -> atomic-edit -> test-runner', 'pulse_dispatch_fix -> kaisser -> task-graph locks']);
  throw new Error(`unknown pulse tool: ${name}`);
}
async function testTool(name, a) {
  if (name === 'run_tsc') return pkgCmd(a.package || 'all', 'typecheck', a.timeoutMs);
  if (name === 'run_eslint') return pkgCmd(a.package || 'all', 'lint', a.timeoutMs, true);
  if (name === 'run_jest') return cmd(['npm', '--prefix', 'backend', 'run', 'test', '--', '--runInBand', ...(a.testPath ? [a.testPath] : [])], a.timeoutMs || 120_000);
  if (name === 'run_vitest') return cmd(['npm', '--prefix', a.package || 'frontend', 'test', ...(a.filter ? ['--', a.filter] : [])], a.timeoutMs || 120_000);
  if (name === 'coverage_for_module') {
    const p = a.package || 'frontend';
    const c = ['npm', '--prefix', p, 'run', p === 'backend' ? 'test:cov' : 'test:coverage'];
    return a.run ? cmd(c, a.timeoutMs || 180_000) : okResult({ dryRun: true, command: c.join(' ') });
  }
  if (name === 'affected_tests') return affected(a.files || []);
  if (name === 'test_summary') return okResult({ commands: { allTypecheck: 'npm run typecheck', allLint: 'npm run lint', backendJest: 'npm --prefix backend run test -- --runInBand', frontendVitest: 'npm --prefix frontend test', workerVitest: 'npm --prefix worker test' } });
  if (name === 'test_mesh_routes') return routes(['affected_tests -> run_jest/run_vitest', 'graphify-plus affected_specs -> test-runner', 'pulse gates -> test-runner verification']);
  throw new Error(`unknown test-runner tool: ${name}`);
}
async function taskTool(name, a) {
  if (name === 'task_import_plan') {
    const all = loadTasks(), now = new Date().toISOString(), incoming = Array.isArray(a.tasks) ? a.tasks : planTasks(a.planText || '');
    const created = incoming.map((x, i) => ({ id: x.id || `task-${Date.now()}-${i}`, title: x.title || String(x).slice(0, 120), description: x.description || '', status: x.status || 'pending', priority: x.priority || 'normal', dependsOn: x.dependsOn || [], source: a.source || x.source || 'mcp', createdAt: now, updatedAt: now }));
    saveTasks([...all, ...created]);
    return okResult({ createdCount: created.length, tasks: created });
  }
  if (name === 'task_list') { const all = loadTasks(); return okResult({ tasks: a.status ? all.filter((x) => x.status === a.status) : all }); }
  if (name === 'task_next') {
    const all = loadTasks(), locks = lockKeys(), next = all.find((x) => x.status === 'pending' && !locks.has(x.id) && depsDone(x, all));
    if (!next) return okResult({ task: null });
    if (a.claimBy) { next.status = 'claimed'; next.claimedBy = a.claimBy; next.updatedAt = new Date().toISOString(); saveTasks(all); acquireLock(next.id, a.claimBy, 3_600_000); }
    return okResult({ task: next });
  }
  if (name === 'task_update') {
    const all = loadTasks(), item = all.find((x) => x.id === a.id);
    if (!item) return { ok: false, error: `task not found: ${a.id}` };
    Object.assign(item, a.fields || {}, a.status ? { status: a.status } : {}, { updatedAt: new Date().toISOString() });
    saveTasks(all);
    return okResult({ task: item });
  }
  if (name === 'task_lock_acquire') return acquireLock(a.key, a.owner, a.ttlMs || 3_600_000);
  if (name === 'task_lock_release') return releaseLock(a.key, a.owner);
  if (name === 'task_stats') {
    const all = loadTasks(), byStatus = {};
    for (const x of all) byStatus[x.status] = (byStatus[x.status] || 0) + 1;
    return okResult({ total: all.length, byStatus, locks: lockKeys().size });
  }
  if (name === 'task_mesh_routes') return routes(['pulse findings -> task_import_plan', 'task_next -> kaisser plan/task round', 'task_lock_acquire -> atomic-edit lock discipline']);
  throw new Error(`unknown task-graph tool: ${name}`);
}
async function pgTool(name, a) {
  if (name === 'pg_status') {
    const c = pgCfg();
    return okResult({ configured: !!c, psqlAvailable: hasCmd('psql'), source: c?.source || null, host: c?.safe.host || null, database: c?.safe.database || null, user: c?.safe.user || null });
  }
  if (name === 'pg_query') return psql(capSelect(a.sql, a.limit || 100), a.timeoutMs || 30_000);
  if (name === 'pg_tables') return psql("select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog','information_schema') order by table_schema, table_name limit 250", 30_000);
  if (name === 'pg_table_describe') return psql(`select column_name, data_type, is_nullable from information_schema.columns where table_schema='${ident(a.schema || 'public')}' and table_name='${ident(a.table)}' order by ordinal_position`, 30_000);
  if (name === 'pg_count') return psql(`select count(*) from "${ident(a.schema || 'public')}"."${ident(a.table)}"`, 30_000);
  if (name === 'pg_recent') return psql(`select * from "${ident(a.schema || 'public')}"."${ident(a.table)}" order by "${ident(a.orderBy || 'createdAt')}" desc limit ${Math.min(Number(a.limit || 25), 100)}`, 30_000);
  if (name === 'pg_explain') return psql(`explain ${readOnly(a.sql)}`, a.timeoutMs || 30_000);
  if (name === 'pg_mesh_routes') return routes(['pg_tables -> codebody nav_trace_prisma_model', 'pg_query -> runtime proof receipts', 'pg_recent -> sentry/railway triage']);
  throw new Error(`unknown postgres tool: ${name}`);
}
async function osTool(name, a) {
  if (name === 'os_status') name = 'kloel_os_status';
  const children = childCommands();
  if (name === 'kloel_os_status') {
    const out = {};
    for (const [key, child] of Object.entries(children)) {
      const available = childAvailable(child), entry = { available, command: child.command, args: child.args };
      if (a.includeToolCounts !== false && available) {
        const listed = await childReq(child, 'tools/list', {}, a.timeoutMs || 8_000);
        entry.toolCount = listed.ok ? listed.result?.tools?.length || 0 : 0;
        if (!listed.ok) entry.error = listed.error;
      }
      out[key] = entry;
    }
    return okResult({ root: ROOT, tier: process.env.KLOEL_OS_TIER || 'NAVIGATE', children: out });
  }
  if (name === 'kloel_os_child_tools') {
    const child = children[a.child];
    if (!child) return { ok: false, error: `unknown child: ${a.child}` };
    const listed = await childReq(child, 'tools/list', {}, a.timeoutMs || 15_000);
    return listed.ok ? okResult({ child: a.child, tools: listed.result.tools || [] }) : listed;
  }
  if (name === 'kloel_os_call_child_tool') { const child = children[a.child]; if (!child) return { ok: false, error: `unknown child: ${a.child}` }; return childReq(child, 'tools/call', { name: a.toolName, arguments: a.arguments || {} }, a.timeoutMs || 60_000); }
  if (name === 'kloel_os_mesh_routes') return routes(['codebody-navigator -> graphify-plus -> atomic-edit -> test-runner', 'pulse -> task-graph -> kaisser -> sentry-bridge', 'saas-compiler -> graphify-plus affected_specs -> test-runner', 'postgres -> codebody proof receipts -> pulse evidence']);
  if (name === 'kloel_os_governance') {
    const p = join(ROOT, 'ops/protected-governance-files.json');
    let protectedFiles = null;
    if (existsSync(p)) {
      try { protectedFiles = JSON.parse(readFileSync(p, 'utf8')); } catch { protectedFiles = 'unparseable'; }
    }
    return okResult({ tier: process.env.KLOEL_OS_TIER || 'NAVIGATE', protectedConfigPresent: existsSync(p), protectedFiles, rules: ['protected governance edits require explicit human approval', 'avoid destructive git worktree rollback commands', 'read-only postgres by default', 'atomic-edit first for code edits'] });
  }
  throw new Error(`unknown kloel-os tool: ${name}`);
}
function routes(r) {
  return okResult({ routes: r });
}
function ex(p) { return existsSync(p.startsWith('/') ? p : join(ROOT, p)); }
function pkgCmd(pkg, script, timeoutMs, lint = false) { return pkg === 'all' ? cmd(['npm', 'run', script === 'typecheck' ? 'typecheck' : 'lint'], timeoutMs || 180_000) : cmd(['npm', '--prefix', pkg, 'run', lint && pkg !== 'frontend' ? 'lint:check' : script], timeoutMs || 120_000); }
function cmd(command, timeoutMs = 120_000, env = {}) { return new Promise((done) => { let stdout = '', stderr = '', settled = false; const child = spawn(command[0], command.slice(1), { cwd: ROOT, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }); const finish = (x) => { if (settled) return; settled = true; clearTimeout(timer); done(x); }; const timer = setTimeout(() => { child.kill('SIGTERM'); finish({ ok: false, timedOut: true, exitCode: null, command: command.join(' '), stdout: stdout.slice(-MAX), stderr: stderr.slice(-MAX) }); }, timeoutMs); child.stdout.on('data', (d) => { stdout += d; }); child.stderr.on('data', (d) => { stderr += d; }); child.on('error', (e) => finish({ ok: false, exitCode: -1, command: command.join(' '), stdout: stdout.slice(-MAX), stderr: `${stderr}\n${e.message}`.slice(-MAX) })); child.on('exit', (code) => finish({ ok: code === 0, exitCode: code, command: command.join(' '), stdout: stdout.slice(-MAX), stderr: stderr.slice(-MAX) })); }); }
function walk(start, max) {
  const out = [], stack = [resolve(start)];
  while (stack.length && out.length < max) {
    let entries;
    const dir = stack.pop();
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if (!isBenignReadError(error)) throw error;
      continue;
    }
    for (const e of entries) {
      if (['node_modules', '.git', '.next'].includes(e.name)) continue;
      const full = join(dir, e.name);
      if (e.isDirectory()) stack.push(full); else out.push(full);
      if (out.length >= max) break;
    }
  }
  return out;
}
function affected(files) {
  const stems = files.map((f) => f.split('/').pop()?.replace(/\.(tsx?|jsx?|mjs|cjs)$/, '')).filter(Boolean);
  const tests = walk(ROOT, 16_000).filter((f) => /\.(test|spec)\.(tsx?|jsx?)$/.test(f) && stems.some((stem) => f.includes(stem))).slice(0, 200);
  return okResult({ files, tests });
}
function artifactDirs() { return ['pulse-out', '.pulse', 'artifacts/pulse', 'scripts/pulse/artifacts'].map((x) => join(ROOT, x)); }
function pulseArtifacts() { return artifactDirs().filter(ex).flatMap((d) => walk(d, 300)).map((f) => f.replace(`${ROOT}/`, '')).sort(); }
function pulseSummary(kind) {
  const artifacts = pulseArtifacts(), hints = artifacts.filter((f) => new RegExp(kind, 'i').test(f)).slice(0, 50);
  return okResult({ kind, artifactCount: artifacts.length, hints, note: hints.length ? undefined : 'No matching artifact names found; run pulse_scan first.' });
}
function taskGraphRoot() { const dir = join(ROOT, '.task-graph'); mkdirSync(dir, { recursive: true }); return dir; }
function tasksPath() { return join(taskGraphRoot(), 'tasks.json'); }
function locksDir() { const dir = join(taskGraphRoot(), 'locks'); mkdirSync(dir, { recursive: true }); return dir; }
function loadTasks() {
  if (!existsSync(tasksPath())) return [];
  return JSON.parse(readFileSync(tasksPath(), 'utf8'));
}
function saveTasks(tasks) { writeFileSync(tasksPath(), JSON.stringify(tasks, null, 2)); }
function planTasks(text) { return text.split(/\r?\n/).map((x) => x.replace(/^[-*]\s+\[[ x]\]\s*/i, '').trim()).filter(Boolean).map((title) => ({ title })); }
function depsDone(task, all) { return (task.dependsOn || []).every((id) => all.find((x) => x.id === id)?.status === 'done'); }
function lockPath(key) { return join(locksDir(), encodeURIComponent(key)); }
function lockKeys() { return existsSync(locksDir()) ? new Set(readdirSync(locksDir()).map(decodeURIComponent)) : new Set(); }
function acquireLock(key, owner, ttlMs) {
  const p = lockPath(key), now = Date.now();
  if (existsSync(p)) {
    try {
      const cur = JSON.parse(readFileSync(p, 'utf8'));
      if (cur.expiresAt > now && cur.owner !== owner) return { ok: false, locked: true, current: cur };
    } catch {
      return { ok: false, error: 'lock file is corrupt', key };
    }
  }
  const lock = { key, owner, acquiredAt: new Date(now).toISOString(), expiresAt: now + ttlMs };
  writeFileSync(p, JSON.stringify(lock, null, 2));
  return okResult({ lock });
}
function releaseLock(key, owner) {
  const p = lockPath(key);
  if (!existsSync(p)) return okResult({ released: false });
  const lock = JSON.parse(readFileSync(p, 'utf8'));
  if (lock.owner !== owner) return { ok: false, error: 'owner mismatch', lock };
  unlinkSync(p);
  return okResult({ released: true });
}
function readEnv(file, key) { if (!existsSync(file)) return null; for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) if (line.startsWith(`${key}=`)) return line.slice(key.length + 1).replace(/^["']|["']$/g, ''); return null; }
function pgCfg() {
  const raw = process.env.DATABASE_URL || readEnv(join(ROOT, 'backend/.env'), 'DATABASE_URL') || readEnv(join(ROOT, '.env'), 'DATABASE_URL');
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return { source: process.env.DATABASE_URL ? 'env' : 'backend/.env', env: { PGHOST: u.hostname, PGPORT: u.port || '5432', PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password), PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')), PGSSLMODE: u.searchParams.get('sslmode') || process.env.PGSSLMODE || 'prefer' }, safe: { host: u.hostname, database: decodeURIComponent(u.pathname.replace(/^\//, '')), user: decodeURIComponent(u.username) } };
  } catch (error) {
    if (process.env.MCP_SUITE_STRICT_ENV === 'true') throw error;
    return null;
  }
}
function readOnly(sql) { const trimmed = sql.trim().replace(/;+\s*$/, ''), normalized = trimmed.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim(); if (!/^(select|with|show)\b/i.test(normalized)) throw new Error('only SELECT/WITH/SHOW queries are allowed'); if (/\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|merge)\b/i.test(normalized)) throw new Error('query contains a forbidden write/DDL keyword'); return trimmed; }
function capSelect(sql, limit) { const checked = readOnly(sql); return /^show\b/i.test(checked) ? checked : `select * from (${checked}) as mcp_readonly_query limit ${Math.min(Number(limit || 100), 100)}`; }
function ident(v) { if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v || '')) throw new Error(`invalid SQL identifier: ${v}`); return v; }
function psql(sql, timeoutMs) { const cfg = pgCfg(); if (!cfg) return { ok: false, error: 'DATABASE_URL is not configured' }; if (!hasCmd('psql')) return { ok: false, error: 'psql is not installed or not on PATH' }; return cmd(['psql', '-X', '--csv', '--set=ON_ERROR_STOP=1', '-c', sql], timeoutMs, cfg.env); }
function childCommands() { const b = (p, transport = 'line') => ({ command: 'bash', args: [join(ROOT, p)], transport }); return { 'atomic-edit': b('scripts/mcp/atomic-edit-mcp-launcher.sh'), 'graphify-plus': b('scripts/mcp/graphify-plus-mcp/launcher.sh'), 'saas-compiler': b('scripts/mcp/saas-compiler-mcp/launcher.sh'), 'codebody-navigator': b('scripts/mcp/codebody-navigator-mcp/launcher.sh'), kaisser: b('scripts/mcp/kaisser-mcp/launcher.sh', 'lsp'), pulse: b('scripts/mcp/pulse-mcp/launcher.sh'), 'test-runner': b('scripts/mcp/test-runner-mcp/launcher.sh'), 'task-graph': b('scripts/mcp/task-graph-mcp/launcher.sh'), postgres: b('scripts/mcp/postgres-mcp/launcher.sh'), 'sentry-bridge': b('scripts/mcp/sentry-bridge-mcp/launcher.sh', 'lsp'), mercadopago: b('scripts/mcp/mercadopago-mcp-launcher.sh'), gitnexus: { command: '/opt/homebrew/bin/gitnexus', args: ['mcp'], transport: 'line' }, codegraph: { command: 'codegraph', args: ['serve', '--mcp'], transport: 'line' } }; }
function childAvailable(c) { return c.command === 'bash' ? existsSync(c.args[0]) : hasCmd(c.command); }
function childReq(c, method, params, timeoutMs) {
  if (!childAvailable(c)) return Promise.resolve({ ok: false, error: 'child command unavailable' });
  return new Promise((done) => {
    const child = spawn(c.command, c.args, { cwd: ROOT, env: process.env, stdio: ['pipe', 'pipe', 'pipe'] });
    let buf = Buffer.alloc(0), stderr = '', id = 1;
    const pending = new Map();
    const finish = (v) => { clearTimeout(timer); child.kill('SIGTERM'); done(v); };
    const timer = setTimeout(() => finish({ ok: false, error: `timeout after ${timeoutMs}ms`, stderr: stderr.slice(-20_000) }), timeoutMs);
    const write = (m) => { const json = JSON.stringify(m); child.stdin.write(c.transport === 'lsp' ? `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}` : `${json}\n`); };
    const req = (m, p) => new Promise((resolveReq, rejectReq) => { const rid = id++; pending.set(rid, { resolveReq, rejectReq }); write({ jsonrpc: '2.0', id: rid, method: m, params: p || {} }); });
    const dispatchChildMessage = (text) => {
      let m;
      try { m = JSON.parse(text); } catch (error) { stderr += `\ninvalid child json: ${error instanceof Error ? error.message : String(error)}`; return; }
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      m.error ? p.rejectReq(new Error(m.error.message || JSON.stringify(m.error))) : p.resolveReq(m.result);
    };
    child.stdout.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (true) {
        const h = buf.indexOf('\r\n\r\n');
        if (h < 0) {
          const n = buf.indexOf('\n');
          if (n < 0) break;
          const line = buf.slice(0, n).toString('utf8').trim();
          buf = buf.slice(n + 1);
          if (line) dispatchChildMessage(line);
          continue;
        }
        const header = buf.slice(0, h).toString('utf8'), match = /Content-Length: (\d+)/i.exec(header), len = Number(match?.[1] || 0), total = h + 4 + len;
        if (!match) { buf = buf.slice(h + 4); continue; }
        if (buf.length < total) break;
        dispatchChildMessage(buf.slice(h + 4, total).toString('utf8'));
        buf = buf.slice(total);
      }
    });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => finish({ ok: false, error: e.message, stderr: stderr.slice(-20_000) }));
    child.on('exit', (code) => { if (pending.size) finish({ ok: false, error: `child exited before response code=${code}`, stderr: stderr.slice(-20_000) }); });
    (async () => {
      await req('initialize', { protocolVersion: PROTO, capabilities: {}, clientInfo: { name: 'kloel-os-proxy', version: '0.1.0' } });
      write({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} });
      finish(okResult({ result: await req(method, params || {}) }));
    })().catch((e) => finish({ ok: false, error: e.message, stderr: stderr.slice(-20_000) }));
  });
}
function hasCmd(c) { return spawnSync('sh', ['-lc', `command -v ${q(c)} >/dev/null 2>&1`], { stdio: 'ignore' }).status === 0; }
function q(v) { return `'${String(v).replace(/'/g, `'\\''`)}'`; }
async function dispatch(method, params = {}) {
  if (method === 'initialize') return { protocolVersion: PROTO, capabilities: { tools: {} }, serverInfo: { name: KIND, version: '0.1.0' } };
  if (method === 'tools/list') return { tools: TOOLS[KIND] || [] };
  if (method === 'tools/call') {
    const out = await callTool(params.name, params.arguments || {});
    return { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }] };
  }
  if (['ping', 'notifications/initialized', 'shutdown'].includes(method)) return {};
  if (method === 'exit') exitCleanly();
  throw new Error(`method not supported: ${method}`);
}
let input = Buffer.alloc(0);
process.stdin.on('data', (chunk) => { input = Buffer.concat([input, chunk]); while (true) { const h = input.indexOf('\r\n\r\n'); if (h < 0) { const n = input.indexOf('\n'); if (n < 0) break; const line = input.slice(0, n).toString('utf8').trim(); input = input.slice(n + 1); if (line) void handle(line); continue; } const match = /Content-Length: (\d+)/i.exec(input.slice(0, h).toString('utf8')), len = Number(match?.[1] || 0), total = h + 4 + len; if (!match) { input = input.slice(h + 4); continue; } if (input.length < total) break; void handle(input.slice(h + 4, total).toString('utf8')); input = input.slice(total); } });
async function handle(text) {
  let req;
  try {
    req = JSON.parse(text);
  } catch (error) {
    process.stderr.write(`invalid MCP request json: ${error instanceof Error ? error.message : String(error)}\n`);
    return;
  }
  if (req.id === undefined) return;
  try {
    send({ jsonrpc: '2.0', id: req.id, result: await dispatch(req.method, req.params || {}) });
  } catch (e) {
    send({ jsonrpc: '2.0', id: req.id, error: { code: -32603, message: e.message || String(e) } });
  }
}
function send(message) { process.stdout.write(`${JSON.stringify(message)}\n`); }
process.on('SIGINT', exitCleanly);
process.on('SIGTERM', exitCleanly);
