// sentry-bridge-mcp — tool schemas + mesh routes (extracted for line budget).

export const tools = [
  {
    name: 'sentry_top_issues',
    description:
      'Top issues by event count for a project. Sorted by count desc. Use for triage.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', enum: ['node', 'javascript-nextjs'], default: 'node' },
        window_hours: { type: 'number', default: 24 },
        limit: { type: 'number', default: 10 },
      },
    },
  },
  {
    name: 'sentry_recent_issues',
    description:
      'Issues first seen within the last N minutes. Use AFTER a deploy to detect regressions. Returns [issue_id, title, count, first_seen, last_seen, level].',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', enum: ['node', 'javascript-nextjs'], default: 'node' },
        since_minutes: { type: 'number', default: 60 },
      },
    },
  },
  {
    name: 'sentry_issue_detail',
    description:
      'Full detail for one issue — title, culprit, latest event with stack trace, tags, breadcrumbs.',
    inputSchema: {
      type: 'object',
      properties: { issue_id: { type: 'string', description: 'e.g. NODE-1E or numeric id' } },
      required: ['issue_id'],
    },
  },
  {
    name: 'sentry_issue_events',
    description: 'Last N events for one issue. Useful when count > 1 to see variations.',
    inputSchema: {
      type: 'object',
      properties: { issue_id: { type: 'string' }, limit: { type: 'number', default: 5 } },
      required: ['issue_id'],
    },
  },
  {
    name: 'sentry_releases',
    description: 'Recent releases with crash-free session/user percentages.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', enum: ['node', 'javascript-nextjs'], default: 'node' },
        limit: { type: 'number', default: 10 },
      },
    },
  },
  {
    name: 'sentry_errors_since_commit',
    description:
      'Find issues first seen AFTER a given timestamp (regression detector). Pass commit timestamp ISO8601 or "auto" to use HEAD timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', enum: ['node', 'javascript-nextjs'], default: 'node' },
        since_iso: { type: 'string', description: 'ISO8601 timestamp; e.g. "2026-05-21T10:00:00Z"' },
      },
      required: ['since_iso'],
    },
  },
  {
    name: 'sentry_event_search',
    description:
      'Search events with Sentry query syntax (e.g. "is:unresolved level:error message:Prisma*").',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', enum: ['node', 'javascript-nextjs'], default: 'node' },
        query: { type: 'string' },
        statsPeriod: { type: 'string', default: '24h' },
      },
      required: ['query'],
    },
  },
  {
    name: 'sentry_resolve_issue',
    description:
      'WRITE: mark an issue as resolved. Optional note for history. Use after the underlying fix is verified.',
    inputSchema: {
      type: 'object',
      properties: { issue_id: { type: 'string' }, note: { type: 'string' } },
      required: ['issue_id'],
    },
  },
  {
    name: 'sentry_assign_issue',
    description: 'WRITE: assign an issue to a Sentry user (username).',
    inputSchema: {
      type: 'object',
      properties: { issue_id: { type: 'string' }, username: { type: 'string' } },
      required: ['issue_id', 'username'],
    },
  },
  {
    name: 'sentry_project_stats',
    description:
      'Event volume per minute for a project over N hours — use to detect spikes/drops.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', enum: ['node', 'javascript-nextjs'], default: 'node' },
        hours: { type: 'number', default: 24 },
      },
    },
  },
  {
    name: 'mesh_routes',
    description: 'Composition with other MCPs (gitnexus, kaisser, pulse, atomic-edit).',
    inputSchema: { type: 'object', properties: {} },
  },
];

export const MESH_ROUTES = {
  description: 'sentry-bridge mesh — close the regression-detection loop',
  routes: [
    {
      verb: 'sentry_recent_issues',
      pairs_with: ['kaisser_audit_log', 'git.log'],
      pattern:
        'after git push: sentry_recent_issues(since_minutes=10) → if new issues → kaisser_audit_log to inspect what was deployed → consider rollback',
    },
    {
      verb: 'sentry_issue_detail',
      pairs_with: ['gitnexus.context', 'codegraph.callers'],
      pattern:
        'sentry_issue_detail returns stack frame → gitnexus.context on the symbol → codegraph.callers to widen the blast radius',
    },
    {
      verb: 'sentry_errors_since_commit',
      pairs_with: ['pulse_dispatch_fix', 'task_graph.task_create'],
      pattern:
        'sentry_errors_since_commit shows new issues after deploy → for each → pulse_dispatch_fix or task_graph.task_create',
    },
    {
      verb: 'sentry_resolve_issue',
      pairs_with: ['atomic-edit', 'test-runner.run_jest', 'kaisser_handoff_write'],
      pattern:
        'after atomic-edit fix + run_jest passes + push succeeds: sentry_resolve_issue marks closed → handoff_write logs the closure',
    },
  ],
  mcp_capabilities: {
    'sentry-bridge': 'regression detection + issue triage + resolve + project stats',
  },
};
