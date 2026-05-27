#!/usr/bin/env node
/**
 * kaisser-mcp exposes the local Kaisser SDLC CLI as MCP tools.
 *
 * The server is intentionally a thin stdio bridge around ~/.claude/bin/kaisser:
 * it does not store secrets, weaken KLOEL guardrails, or bypass Kaisser audit.
 */

import { spawn } from 'node:child_process';
import process from 'node:process';

const PROTO_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'kaisser', version: '0.1.0' };
const KAISSER_BIN = process.env.KAISSER_BIN || `${process.env.HOME}/.claude/bin/kaisser`;
const CWD = process.env.KAISSER_CWD || process.cwd();

const tools = [
  {
    name: 'kaisser_doctor',
    description: 'Run Kaisser health checks. Use mode=quick for secret-free checks.',
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['quick', 'full'], default: 'quick' },
      },
    },
  },
  {
    name: 'kaisser_deploy_dry_run',
    description: 'Run kaisser deploy --dry-run to detect install/manifest drift without writing.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kaisser_audit_log',
    description: 'Read recent Kaisser audit log entries with optional filtering.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', default: 20 },
        since_hours: { type: 'number', default: 24 },
        rule: { type: 'string' },
      },
    },
  },
  {
    name: 'kaisser_plan_list',
    description: 'List Kaisser plan files from .planning/.',
    inputSchema: {
      type: 'object',
      properties: {
        range: { type: 'string', description: 'Optional plan id range, for example 100-150.' },
        format: { type: 'string', enum: ['json', 'table'], default: 'json' },
      },
    },
  },
  {
    name: 'kaisser_plan_tasks',
    description: 'List tasks for a Kaisser plan id.',
    inputSchema: {
      type: 'object',
      properties: { plan_id: { type: 'string' } },
      required: ['plan_id'],
    },
  },
  {
    name: 'kaisser_plan_rounds',
    description: 'Compute parallel execution rounds for a Kaisser plan id.',
    inputSchema: {
      type: 'object',
      properties: { plan_id: { type: 'string' } },
      required: ['plan_id'],
    },
  },
  {
    name: 'kaisser_backlog_list',
    description: 'List Kaisser backlog items as JSON.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kaisser_handoff_write',
    description: 'Write session-handoff frontmatter fields from a JSON object.',
    inputSchema: {
      type: 'object',
      properties: {
        fields: { type: 'object', description: 'Frontmatter field map to persist.' },
      },
      required: ['fields'],
    },
  },
  {
    name: 'kaisser_handoff_read',
    description: 'Read session-handoff frontmatter, optionally a single field.',
    inputSchema: {
      type: 'object',
      properties: { field: { type: 'string' } },
    },
  },
  {
    name: 'kaisser_handoff_drift',
    description: 'Compare handoff claims against live repository state.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kaisser_meta',
    description: 'Return Kaisser metadata for a plan id.',
    inputSchema: {
      type: 'object',
      properties: { plan_id: { type: 'string' } },
      required: ['plan_id'],
    },
  },
  {
    name: 'kaisser_full',
    description: 'Return Kaisser full context: git context plus plan metadata.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kaisser_detect_stack',
    description: 'Detect project language, framework, test runner, and runtime metadata.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kaisser_nextid',
    description: 'Reserve the next Kaisser plan/backlog/report ids atomically.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kaisser_pr_review_fetch',
    description: 'Fetch comprehensive PR review data for a pull request number.',
    inputSchema: {
      type: 'object',
      properties: { pr_number: { type: 'number' } },
      required: ['pr_number'],
    },
  },
  {
    name: 'kaisser_mesh_routes',
    description: 'Return Kaisser MCP composition routes for the local MCP mesh.',
    inputSchema: { type: 'object', properties: {} },
  },
];

const MESH_ROUTES = {
  description: 'Composition mesh for Kaisser SDLC orchestration.',
  routes: [
    {
      verb: 'kaisser_plan_rounds',
      pairs_with: ['gitnexus.detect_changes', 'atomic-edit.atomic_lock_acquire'],
      pattern: 'plan_rounds -> claim disjoint work -> verify changes before completion',
    },
    {
      verb: 'kaisser_audit_log',
      pairs_with: ['atomic-edit.atomic_replace_text', 'pulse.scan'],
      pattern: 'audit_log -> repair blocked action with atomic edit -> re-scan affected module',
    },
    {
      verb: 'kaisser_handoff_read',
      pairs_with: ['kaisser_handoff_drift', 'gitnexus.status'],
      pattern: 'session start -> read handoff -> check drift -> verify graph/index freshness',
    },
    {
      verb: 'kaisser_handoff_write',
      pairs_with: ['gitnexus.detect_changes', 'test-runner.test_summary'],
      pattern: 'session end -> capture verified state and remaining work',
    },
    {
      verb: 'kaisser_pr_review_fetch',
      pairs_with: ['github.pr', 'codacy.issues'],
      pattern: 'review fetch -> map actionable comments -> patch and revalidate',
    },
  ],
  mcp_capabilities: {
    kaisser: 'SDLC governance, audit, plans, handoff, PR review, stack detection',
    atomic_edit: 'Structured syntax-validated edits',
    gitnexus: 'Graph context, impact, detect changes',
    codegraph: 'Fast code context and symbol search',
  },
};

function send(obj) {
  const body = JSON.stringify(obj);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`);
}

function asContent(value) {
  return {
    content: [
      {
        type: 'text',
        text: typeof value === 'string' ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

function requireString(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}

function execKaisser(args, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(KAISSER_BIN, args, {
      cwd: CWD,
      env: { ...process.env, ...(opts.env || {}) },
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data;
    });
    child.stderr.on('data', (data) => {
      stderr += data;
    });
    child.on('error', (error) => {
      resolve({ code: 1, stdout: '', stderr: error.message });
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 0, stdout: stdout.trim(), stderr: stderr.trim() });
    });
    if (opts.stdin) {
      child.stdin.write(opts.stdin);
      child.stdin.end();
    }
  });
}

async function callTool(name, args = {}) {
  switch (name) {
    case 'kaisser_doctor': {
      const flags = args.mode === 'full' ? [] : ['--quick'];
      return execKaisser(['doctor', ...flags]);
    }
    case 'kaisser_deploy_dry_run':
      return execKaisser(['deploy', '--dry-run']);
    case 'kaisser_audit_log': {
      const limit = boundedNumber(args.limit, 20, 1, 200);
      const sinceHours = boundedNumber(args.since_hours, 24, 1, 720);
      const cli = ['audit-log', '--limit', String(limit), '--since', `${sinceHours}h`];
      if (typeof args.rule === 'string' && args.rule.trim()) cli.push('--rule', args.rule.trim());
      return execKaisser(cli);
    }
    case 'kaisser_plan_list': {
      const cli = ['plan-list'];
      if (typeof args.range === 'string' && args.range.trim()) cli.push('--range', args.range.trim());
      if (args.format === 'table') cli.push('--format', 'table');
      else cli.push('--format', 'json');
      return execKaisser(cli);
    }
    case 'kaisser_plan_tasks':
      return execKaisser(['plan-tasks', requireString(args.plan_id, 'plan_id')]);
    case 'kaisser_plan_rounds':
      return execKaisser(['plan-rounds', requireString(args.plan_id, 'plan_id')]);
    case 'kaisser_backlog_list':
      return execKaisser(['backlog']);
    case 'kaisser_handoff_write':
      if (!args.fields || typeof args.fields !== 'object' || Array.isArray(args.fields)) {
        throw new Error('fields object is required');
      }
      return execKaisser(['handoff', 'write'], { stdin: JSON.stringify(args.fields) });
    case 'kaisser_handoff_read': {
      const cli = ['handoff', 'read'];
      if (typeof args.field === 'string' && args.field.trim()) cli.push('--field', args.field.trim());
      return execKaisser(cli);
    }
    case 'kaisser_handoff_drift':
      return execKaisser(['handoff', 'drift']);
    case 'kaisser_meta':
      return execKaisser(['meta', requireString(args.plan_id, 'plan_id')]);
    case 'kaisser_full':
      return execKaisser(['full']);
    case 'kaisser_detect_stack':
      return execKaisser(['detect-stack']);
    case 'kaisser_nextid':
      return execKaisser(['nextid']);
    case 'kaisser_pr_review_fetch':
      return execKaisser(['pr-review', '--pr', String(boundedNumber(args.pr_number, 0, 1, 1000000))]);
    case 'kaisser_mesh_routes':
      return { code: 0, stdout: JSON.stringify(MESH_ROUTES), stderr: '' };
    default:
      return { code: 1, stdout: '', stderr: `unknown tool: ${name}` };
  }
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buffer += chunk;
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (!line.trim()) continue;
      try {
        void handle(JSON.parse(line));
      } catch {
        // Ignore malformed probe lines.
      }
      continue;
    }

    const header = buffer.slice(0, headerEnd);
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + length) return;
    const body = buffer.slice(bodyStart, bodyStart + length);
    buffer = buffer.slice(bodyStart + length);
    try {
      void handle(JSON.parse(body));
    } catch {
      // Ignore malformed probe bodies.
    }
  }
});

async function handle(msg) {
  if (msg.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: msg.id,
      result: {
        protocolVersion: PROTO_VERSION,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      },
    });
    return;
  }
  if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools } });
    return;
  }
  if (msg.method === 'tools/call') {
    const { name, arguments: toolArgs } = msg.params || {};
    try {
      const result = await callTool(name, toolArgs || {});
      let payload = result;
      if (result.code === 0 && result.stdout) {
        try {
          payload = JSON.parse(result.stdout);
        } catch {
          payload = result.stdout;
        }
      }
      send({ jsonrpc: '2.0', id: msg.id, result: asContent(payload) });
    } catch (error) {
      send({
        jsonrpc: '2.0',
        id: msg.id,
        error: { code: -32603, message: error instanceof Error ? error.message : String(error) },
      });
    }
    return;
  }
  if (msg.method === 'shutdown' || msg.method === 'exit') {
    process.exit(0);
  }
}
