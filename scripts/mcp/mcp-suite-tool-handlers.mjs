import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export function createToolHandlers({
  kind: KIND,
  root: ROOT,
  runPackageCommand,
  runCommand,
  affectedTests,
  artifactDirs,
  listPulseArtifacts,
  pulseArtifactSummary,
  loadTasks,
  saveTasks,
  tasksFromPlanText,
  depsDone,
  lockKeys,
  acquireLock,
  releaseLock,
  postgresConfig,
  assertReadOnly,
  capSelect,
  ident,
  runPsql,
  childCommands,
  childAvailable,
  mcpChildRequest,
  commandExists,
}) {
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
    if (name === 'pulse_history')
      return { ok: true, artifacts: listPulseArtifacts().slice(0, 200) };
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

  async function postgresTool(name, args) {
    if (name === 'pg_status') {
      const cfg = postgresConfig();
      return {
        ok: true,
        configured: !!cfg,
        psqlAvailable: commandExists('psql'),
        source: cfg?.source || null,
        host: cfg?.safe.host || null,
        database: cfg?.safe.database || null,
        user: cfg?.safe.user || null,
      };
    }
    if (name === 'pg_query')
      return runPsql(capSelect(args.sql, args.limit || 100), args.timeoutMs || 30_000);
    if (name === 'pg_tables') {
      return runPsql(
        "select table_schema, table_name from information_schema.tables where table_schema not in ('pg_catalog','information_schema') order by table_schema, table_name limit 250",
        30_000,
      );
    }
    if (name === 'pg_table_describe') {
      const schema = ident(args.schema || 'public');
      const table = ident(args.table);
      return runPsql(
        `select column_name, data_type, is_nullable from information_schema.columns where table_schema='${schema}' and table_name='${table}' order by ordinal_position`,
        30_000,
      );
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
      return runPsql(
        `select * from "${schema}"."${table}" order by "${orderBy}" desc limit ${limit}`,
        30_000,
      );
    }
    if (name === 'pg_explain')
      return runPsql(`explain ${assertReadOnly(args.sql)}`, args.timeoutMs || 30_000);
    if (name === 'pg_mesh_routes') {
      return {
        ok: true,
        routes: [
          'pg_tables -> codebody nav_trace_prisma_model',
          'pg_query -> runtime proof receipts',
          'pg_recent -> sentry/railway incident triage',
        ],
      };
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
      return mcpChildRequest(
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
          'no destructive git file restoration',
          'read-only postgres by default',
          'atomic-edit first for code edits',
        ],
      };
    }
    throw new Error(`unknown kloel-os tool: ${name}`);
  }

  return callTool;
}
