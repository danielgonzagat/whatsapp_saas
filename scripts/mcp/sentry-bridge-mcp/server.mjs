#!/usr/bin/env node
/**
 * sentry-bridge-mcp — Sentry REST API as MCP tools, focused on the
 * regression-detection loop. Closes one of the 3 production-readiness gaps.
 *
 * Tools:
 *  - sentry_top_issues(project, window_hours)         → top issues with counts
 *  - sentry_recent_issues(project, since_minutes)     → issues created since N min ago (regression detector)
 *  - sentry_issue_detail(issue_id)                    → full event + stack trace + tags
 *  - sentry_issue_events(issue_id, limit)             → last N events for one issue
 *  - sentry_releases(project, limit)                  → recent releases with crash-free %
 *  - sentry_errors_since_commit(project, commit_sha)  → issues seen since a deploy
 *  - sentry_event_search(project, query, window)      → Sentry search syntax
 *  - sentry_resolve_issue(issue_id, note?)            → mark resolved (write)
 *  - sentry_assign_issue(issue_id, username)          → assign to user
 *  - sentry_project_stats(project, hours)             → events/min trend
 *  - mesh_routes
 *
 * Auth: SENTRY_PERSONAL_TOKEN from .env.pulse.local (auto-loaded by launcher).
 * Org: SENTRY_ORG from same env.
 *
 * Mesh:
 *  - sentry_recent_issues + kaisser_audit_log = "what errors appeared
 *    since my last push?"
 *  - sentry_errors_since_commit + git_log = correlate code changes ↔ regressions
 *  - sentry_issue_detail + gitnexus.context = "show me the function in this
 *    stack trace"
 *  - sentry_resolve_issue after pulse_dispatch_fix succeeds = closure
 */

import { request } from 'node:https';
import process from 'node:process';

const PROTO_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'sentry-bridge', version: '0.1.0' };
const TOKEN = process.env.SENTRY_PERSONAL_TOKEN || process.env.SENTRY_AUTH_TOKEN;
const ORG = process.env.SENTRY_ORG || 'kloel-inteligencia-comercial-a';
const REGION = 'us'; // org is in us.sentry.io

const tools = [
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

const MESH_ROUTES = {
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

// ─── HTTP helper ───────────────────────────────────────────────────────────

function sentryRequest(path, options = {}) {
  return new Promise((resolve) => {
    if (!TOKEN) {
      resolve({ status: 401, body: { error: 'SENTRY_PERSONAL_TOKEN missing in env' } });
      return;
    }
    const url = new URL(`https://${REGION}.sentry.io/api/0${path}`);
    const req = request({
      method: options.method || 'GET',
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'User-Agent': 'sentry-bridge-mcp/0.1.0',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on('error', (e) => resolve({ status: 0, body: { error: e.message } }));
    if (options.body) req.write(JSON.stringify(options.body));
    req.end();
  });
}

// ─── Tool handlers ─────────────────────────────────────────────────────────

async function topIssues({ project, window_hours, limit }) {
  const r = await sentryRequest(
    `/projects/${ORG}/${project || 'node'}/issues/?limit=${limit || 10}&statsPeriod=${window_hours || 24}h&sort=freq`,
  );
  if (r.status !== 200) return { code: r.status, body: r.body };
  const issues = (r.body || []).map((i) => ({
    id: i.shortId,
    title: i.title,
    culprit: i.culprit,
    count: Number(i.count),
    userCount: i.userCount,
    level: i.level,
    firstSeen: i.firstSeen,
    lastSeen: i.lastSeen,
    permalink: i.permalink,
    issue_url: `https://${ORG}.sentry.io/issues/${i.id}/`,
  }));
  return { code: 200, count: issues.length, issues };
}

async function recentIssues({ project, since_minutes }) {
  const m = Number(since_minutes || 60);
  const sinceMs = Date.now() - m * 60 * 1000;
  const r = await sentryRequest(
    `/projects/${ORG}/${project || 'node'}/issues/?limit=50&statsPeriod=${Math.max(1, Math.ceil(m / 60))}h&sort=new`,
  );
  if (r.status !== 200) return { code: r.status, body: r.body };
  const recent = (r.body || []).filter((i) => new Date(i.firstSeen).getTime() >= sinceMs);
  return {
    code: 200,
    since_minutes: m,
    new_issues_count: recent.length,
    issues: recent.map((i) => ({
      id: i.shortId,
      title: i.title,
      count: Number(i.count),
      level: i.level,
      firstSeen: i.firstSeen,
      permalink: i.permalink,
    })),
  };
}

async function issueDetail({ issue_id }) {
  // First fetch issue by shortId or numeric id
  const r = await sentryRequest(`/organizations/${ORG}/issues/${issue_id}/`);
  if (r.status !== 200) return { code: r.status, body: r.body };
  const i = r.body;
  // Then latest event
  const ev = await sentryRequest(`/organizations/${ORG}/issues/${issue_id}/events/latest/`);
  const event = ev.status === 200 ? ev.body : null;
  return {
    code: 200,
    issue: {
      id: i.shortId,
      title: i.title,
      culprit: i.culprit,
      count: i.count,
      userCount: i.userCount,
      level: i.level,
      status: i.status,
      assignedTo: i.assignedTo,
      tags: i.tags?.slice(0, 10),
      firstSeen: i.firstSeen,
      lastSeen: i.lastSeen,
      permalink: i.permalink,
    },
    latest_event: event
      ? {
          eventID: event.eventID,
          message: event.message,
          platform: event.platform,
          dateCreated: event.dateCreated,
          contexts: event.contexts,
          tags: event.tags?.slice(0, 10),
          exception: event.entries?.find((e) => e.type === 'exception')?.data?.values?.[0],
          breadcrumbs: event.entries?.find((e) => e.type === 'breadcrumbs')?.data?.values?.slice(-5),
        }
      : null,
  };
}

async function issueEvents({ issue_id, limit }) {
  const r = await sentryRequest(`/organizations/${ORG}/issues/${issue_id}/events/?limit=${limit || 5}`);
  if (r.status !== 200) return { code: r.status, body: r.body };
  return {
    code: 200,
    count: r.body?.length || 0,
    events: (r.body || []).slice(0, limit || 5).map((e) => ({
      eventID: e.eventID,
      message: e.message,
      dateCreated: e.dateCreated,
      tags: e.tags?.slice(0, 8),
    })),
  };
}

async function releases({ project, limit }) {
  const r = await sentryRequest(`/organizations/${ORG}/releases/?project=${project || 'node'}&per_page=${limit || 10}`);
  if (r.status !== 200) return { code: r.status, body: r.body };
  return {
    code: 200,
    count: r.body?.length || 0,
    releases: (r.body || []).map((rel) => ({
      version: rel.version,
      shortVersion: rel.shortVersion,
      dateReleased: rel.dateReleased || rel.dateCreated,
      newGroups: rel.newGroups,
      crashFreeSessions: rel.crashFreeSessions,
      crashFreeUsers: rel.crashFreeUsers,
    })),
  };
}

async function errorsSinceCommit({ project, since_iso }) {
  // Sentry's `firstSeen:>2026-05-20T12:00:00` syntax
  const r = await sentryRequest(
    `/projects/${ORG}/${project || 'node'}/issues/?limit=100&statsPeriod=14d&query=${encodeURIComponent(`firstSeen:>${since_iso}`)}`,
  );
  if (r.status !== 200) return { code: r.status, body: r.body };
  return {
    code: 200,
    since: since_iso,
    new_issues_count: r.body?.length || 0,
    issues: (r.body || []).map((i) => ({
      id: i.shortId,
      title: i.title,
      count: Number(i.count),
      level: i.level,
      firstSeen: i.firstSeen,
      permalink: i.permalink,
    })),
  };
}

async function eventSearch({ project, query, statsPeriod }) {
  const r = await sentryRequest(
    `/projects/${ORG}/${project || 'node'}/issues/?limit=20&statsPeriod=${statsPeriod || '24h'}&query=${encodeURIComponent(query)}`,
  );
  if (r.status !== 200) return { code: r.status, body: r.body };
  return {
    code: 200,
    query,
    count: r.body?.length || 0,
    issues: (r.body || []).map((i) => ({ id: i.shortId, title: i.title, count: Number(i.count), level: i.level })),
  };
}

async function resolveIssue({ issue_id, note }) {
  const r = await sentryRequest(`/organizations/${ORG}/issues/${issue_id}/`, {
    method: 'PUT',
    body: { status: 'resolved', ...(note ? { statusDetails: { inNextRelease: false } } : {}) },
  });
  return { code: r.status, body: r.body, action: 'resolved', issue_id };
}

async function assignIssue({ issue_id, username }) {
  const r = await sentryRequest(`/organizations/${ORG}/issues/${issue_id}/`, {
    method: 'PUT',
    body: { assignedTo: username },
  });
  return { code: r.status, body: r.body, action: 'assigned', issue_id, to: username };
}

async function projectStats({ project, hours }) {
  const r = await sentryRequest(
    `/projects/${ORG}/${project || 'node'}/stats/?stat=received&since=${Math.floor(Date.now() / 1000) - (hours || 24) * 3600}&resolution=1h`,
  );
  if (r.status !== 200) return { code: r.status, body: r.body };
  const series = Array.isArray(r.body) ? r.body : [];
  const total = series.reduce((s, [, v]) => s + v, 0);
  const avgPerHour = series.length ? total / series.length : 0;
  return {
    code: 200,
    project,
    hours,
    total_events: total,
    avg_per_hour: Math.round(avgPerHour),
    series: series.slice(-24),
  };
}

// ─── JSON-RPC ──────────────────────────────────────────────────────────────

function send(obj) {
  const body = JSON.stringify(obj);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}
function asContent(v) {
  return { content: [{ type: 'text', text: typeof v === 'string' ? v : JSON.stringify(v, null, 2) }] };
}

async function callTool(name, args) {
  args = args || {};
  switch (name) {
    case 'sentry_top_issues': return await topIssues(args);
    case 'sentry_recent_issues': return await recentIssues(args);
    case 'sentry_issue_detail': return await issueDetail(args);
    case 'sentry_issue_events': return await issueEvents(args);
    case 'sentry_releases': return await releases(args);
    case 'sentry_errors_since_commit': return await errorsSinceCommit(args);
    case 'sentry_event_search': return await eventSearch(args);
    case 'sentry_resolve_issue': return await resolveIssue(args);
    case 'sentry_assign_issue': return await assignIssue(args);
    case 'sentry_project_stats': return await projectStats(args);
    case 'mesh_routes': return MESH_ROUTES;
    default: return { code: 1, error: `unknown tool: ${name}` };
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      const nl = buffer.indexOf('\n');
      if (nl === -1) return;
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      try { handle(JSON.parse(line)); } catch {}
      continue;
    }
    const m = /Content-Length:\s*(\d+)/i.exec(buffer.slice(0, headerEnd));
    if (!m) { buffer = buffer.slice(headerEnd + 4); continue; }
    const len = Number(m[1]);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + len) return;
    try { handle(JSON.parse(buffer.slice(bodyStart, bodyStart + len))); } catch {}
    buffer = buffer.slice(bodyStart + len);
  }
});

async function handle(msg) {
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: PROTO_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO } });
    return;
  }
  if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools } });
    return;
  }
  if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params || {};
    try {
      const r = await callTool(name, args);
      send({ jsonrpc: '2.0', id: msg.id, result: asContent(r) });
    } catch (e) {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: e instanceof Error ? e.message : String(e) } });
    }
    return;
  }
  if (msg.method === 'shutdown' || msg.method === 'exit') process.exit(0);
}
