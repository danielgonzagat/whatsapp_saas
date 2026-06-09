export const tools = [
  {
    name: 'hot_clusters',
    description:
      'Composite priority ranker over the enriched graph: hot files weighted by runtime errors (Sentry) + blast radius (in-degree) + doc-freshness drift. Returns top-N candidates for the next autonomous PR wave.',
    inputSchema: {
      type: 'object',
      properties: {
        top: { type: 'number', description: 'Number of clusters (default 10)' },
      },
    },
  },
  {
    name: 'blast_radius',
    description:
      'For a symbol/file, return callers+callees+inbound+outbound in one consolidated structure (saves 3 codegraph_* calls). Use before changing public API.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string' },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'metadata_for_file',
    description:
      'Returns every ADR, CLAUDE.md note, memory file, doc reference that mentions the given file path. Use to gather all institutional knowledge before refactoring.',
    inputSchema: {
      type: 'object',
      properties: { file: { type: 'string' } },
      required: ['file'],
    },
  },
  {
    name: 'route_gap_inventory',
    description:
      'Returns the prioritised list of route gaps (P1/P2/P3/P4). Use to pick the next Wave-11 route conversion target.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'runtime_errors',
    description:
      'Returns Sentry/Railway runtime errors mapped to source-tree nodes from the last N hours. Each error includes culprit file + symbol + count + last-seen, ready to feed into hot_clusters.',
    inputSchema: {
      type: 'object',
      properties: {
        hours: { type: 'number', description: 'Window in hours (default 24)' },
      },
    },
  },
  {
    name: 'affected_specs',
    description:
      'Given a set of changed files, returns ONLY the spec/test files that exercise them (forward + reverse imports). Cross-language. Use to run minimal validation after edits.',
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string' } },
      },
      required: ['files'],
    },
  },
  {
    name: 'auto_pr_dispatch',
    description:
      'Emits a job into the L13 auto-PR queue (graphify-out/auto-pr-jobs/). Loop-runner daemon picks it up within 5 min, opens the PR, CI runs, auto-merger merges when green. Use to ship work without per-PR babysitting.',
    inputSchema: {
      type: 'object',
      properties: {
        template: {
          type: 'string',
          enum: ['cluster-tag', 'eslint-fix', 'decompose', 'route-gap-conversion'],
        },
        files: { type: 'array', items: { type: 'string' } },
        meta: { type: 'object', description: 'Free-form metadata (rule name, target LOC, etc.)' },
      },
      required: ['template', 'files'],
    },
  },
  {
    name: 'playwright_diff',
    description:
      'Runs Playwright pixelmatch against the reference screenshot for the given surface slug. Returns ratio + diff PNG path. Use as visual fidelity gate before merging visual PRs.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: {
          type: 'string',
          description: 'Surface slug from tools/visual-fidelity/surfaces.json',
        },
        url: { type: 'string', description: 'Override base URL (default http://localhost:3000)' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'codacy_drain_jobs',
    description:
      'Runs codacy-drain.mjs in dry-run mode: returns the eslint --fix-dry-run jobs the pipeline WOULD generate for the given rules and workspaces. Use to size a real-debt drain wave before triggering it.',
    inputSchema: {
      type: 'object',
      properties: {
        rules: { type: 'array', items: { type: 'string' } },
        workspaces: { type: 'array', items: { type: 'string' } },
      },
    },
  },
  {
    name: 'session_state',
    description:
      'Returns the freshly-computed SESSION_STATE.md (git status, recent commits, PULSE state, protected-file dirtiness, suggested next task). Use as the first call when entering a new session.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'taskgraph_lock_status',
    description:
      'Returns the L11 multi-agent file-locks currently held in tools/agent-coordination/locks/. Each lock has cluster name, holder agent, last heartbeat. Use to avoid collisions before claiming a cluster.',
    inputSchema: { type: 'object', properties: {} },
  },
];
