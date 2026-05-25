function tool(name, description, properties = {}, required = []) {
  return { name, description, inputSchema: { type: 'object', properties, required } };
}

export const TOOLSETS = {
  pulse: [
    tool('pulse_status', 'Report PULSE launcher health and known artifact locations.'),
    tool('pulse_scan', 'Run a PULSE scan mode and return structured command output.', {
      mode: {
        type: 'string',
        enum: ['json', 'report', 'certify', 'ci', 'deep-ci', 'autonomous-dry'],
      },
      timeoutMs: { type: 'number' },
    }),
    tool(
      'pulse_scan_module',
      'Run a PULSE JSON scan scoped to a module when the underlying CLI supports it.',
      {
        module: { type: 'string' },
        timeoutMs: { type: 'number' },
      },
      ['module'],
    ),
    tool('pulse_report', 'Run the PULSE report command.'),
    tool('pulse_health_by_module', 'Summarize available PULSE module health artifacts.'),
    tool('pulse_top_gates', 'Return recent gate/failure hints from PULSE artifacts when present.'),
    tool('pulse_dispatch_fix', 'Dispatch or dry-run PULSE autonomous remediation.', {
      dryRun: { type: 'boolean' },
      confirm: { type: 'boolean' },
      timeoutMs: { type: 'number' },
    }),
    tool('pulse_history', 'List recent PULSE artifacts generated in this repository.'),
    tool(
      'pulse_mesh_routes',
      'Describe how PULSE composes with atomic-edit, test-runner, task-graph, and kaisser.',
    ),
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
    tool(
      'affected_tests',
      'Find likely affected test files from changed/source files.',
      {
        files: { type: 'array', items: { type: 'string' } },
      },
      ['files'],
    ),
    tool('test_summary', 'Return the test command inventory exposed by this repo.'),
    tool(
      'test_mesh_routes',
      'Describe how test-runner composes with graphify-plus, pulse, and task-graph.',
    ),
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
    tool(
      'task_update',
      'Update a task status or fields.',
      {
        id: { type: 'string' },
        status: { type: 'string' },
        fields: { type: 'object' },
      },
      ['id'],
    ),
    tool(
      'task_lock_acquire',
      'Acquire a persistent lock key for a worker.',
      {
        key: { type: 'string' },
        owner: { type: 'string' },
        ttlMs: { type: 'number' },
      },
      ['key', 'owner'],
    ),
    tool(
      'task_lock_release',
      'Release a persistent lock key when owner matches.',
      {
        key: { type: 'string' },
        owner: { type: 'string' },
      },
      ['key', 'owner'],
    ),
    tool('task_stats', 'Return task and lock counts.'),
    tool(
      'task_mesh_routes',
      'Describe how task-graph coordinates PULSE, kaisser, and test-runner.',
    ),
  ],
  postgres: [
    tool(
      'pg_status',
      'Report read-only Postgres connection configuration without exposing secrets.',
    ),
    tool(
      'pg_query',
      'Run a read-only SELECT/WITH/SHOW query with a row cap.',
      {
        sql: { type: 'string' },
        limit: { type: 'number' },
        timeoutMs: { type: 'number' },
      },
      ['sql'],
    ),
    tool('pg_tables', 'List visible public tables.'),
    tool(
      'pg_table_describe',
      'Describe columns for a table.',
      {
        table: { type: 'string' },
        schema: { type: 'string' },
      },
      ['table'],
    ),
    tool(
      'pg_count',
      'Count rows in a table.',
      {
        table: { type: 'string' },
        schema: { type: 'string' },
      },
      ['table'],
    ),
    tool(
      'pg_recent',
      'Return recent rows ordered by a timestamp column.',
      {
        table: { type: 'string' },
        schema: { type: 'string' },
        orderBy: { type: 'string' },
        limit: { type: 'number' },
      },
      ['table'],
    ),
    tool(
      'pg_explain',
      'Run EXPLAIN on a read-only query.',
      {
        sql: { type: 'string' },
        timeoutMs: { type: 'number' },
      },
      ['sql'],
    ),
    tool(
      'pg_mesh_routes',
      'Describe how postgres composes with PULSE, graphify-plus, and codebody.',
    ),
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
    tool(
      'kloel_os_child_tools',
      'List tools exposed by a child MCP.',
      {
        child: { type: 'string' },
        timeoutMs: { type: 'number' },
      },
      ['child'],
    ),
    tool(
      'kloel_os_call_child_tool',
      'Call a tool on a child MCP through the Kloel OS proxy.',
      {
        child: { type: 'string' },
        toolName: { type: 'string' },
        arguments: { type: 'object' },
        timeoutMs: { type: 'number' },
      },
      ['child', 'toolName'],
    ),
    tool('kloel_os_mesh_routes', 'Return active MCP composition routes for Kloel work.'),
    tool(
      'kloel_os_governance',
      'Return protected-surface and tier information without weakening governance.',
    ),
  ],
};
