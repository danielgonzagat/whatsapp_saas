#!/usr/bin/env node
/**
 * sentry-bridge-mcp — Sentry REST API as MCP tools, focused on the
 * regression-detection loop. Closes one of the 3 production-readiness gaps.
 *
 * Tools:
 *  - sentry_top_issues / sentry_recent_issues / sentry_issue_detail
 *  - sentry_issue_events / sentry_releases / sentry_errors_since_commit
 *  - sentry_event_search / sentry_resolve_issue / sentry_assign_issue
 *  - sentry_project_stats / mesh_routes
 *
 * Auth: SENTRY_PERSONAL_TOKEN from .env.pulse.local (auto-loaded by launcher).
 * Org: SENTRY_ORG from same env.
 *
 * Schema definitions live in tool-definitions.mjs; handler bodies live in
 * tool-handlers.mjs (split for per-file line budget).
 */

import process from 'node:process';
import { tools, MESH_ROUTES } from './tool-definitions.mjs';
import {
  topIssues, recentIssues, issueDetail, issueEvents, releases,
  errorsSinceCommit, eventSearch, resolveIssue, assignIssue, projectStats,
} from './tool-handlers.mjs';

const PROTO_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'sentry-bridge', version: '0.1.0' };

function send(obj) {
  const body = JSON.stringify(obj);
  process.stdout.write(body + '\n');
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
