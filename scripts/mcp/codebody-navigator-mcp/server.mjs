#!/usr/bin/env node
/**
 * kloel-codebody-navigator-mcp — the "body that walks inside the codebase".
 *
 * Exposes 40+ MCP tools across six layers:
 *   L1 body           start_session, where_am_i, move_to_*, back, breadcrumbs
 *   L2 semantic       jump_to_definition, find_references, follow_call, …
 *   L3 routes         trace_endpoint, trace_chat_action, trace_domain, …
 *   L4 frontier       detect_gaps, next_best_probe, find_orphan_modules, …
 *   L5 proof          plan_chat_to_effect, verify_receipt, hypothesis/surprise
 *   L6 capability     explore_capability_gap, audit_organism
 *
 * Transport: stdio JSON-RPC 2.0 with LSP framing (same as graphify-plus-mcp /
 * saas-compiler-mcp / atomic-edit-mcp). Compatible with Claude Code, Codex,
 * OpenCode, Hermes — every CLI agent that already mounts those MCPs.
 */

import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createNavigator, TOOL_CATALOGUE } from './lib/tools.mjs';

const ROOT = process.env.CODEBODY_NAV_ROOT || process.env.SAAS_COMPILER_ROOT || process.cwd();
const STATE_DIR = process.env.CODEBODY_NAV_STATE || join(ROOT, '.codegraph', 'codebody-navigator');
if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });

const PROTO_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'kloel-codebody-navigator', version: '0.1.0' };

const nav = createNavigator({ workspaceRoot: ROOT, stateDir: STATE_DIR });

async function dispatchTool(name, args) {
  const fn = nav[name];
  if (!fn) throw new Error(`unknown tool: ${name}`);
  try {
    const out = fn(args || {});
    return out instanceof Promise ? await out : out;
  } catch (err) {
    return { ok: false, error: err?.message || String(err), stack: err?.stack };
  }
}

// ─── JSON-RPC over stdio (LSP framing OR newline-delimited) ─────────────────
// IMPORTANT: framing accounting must be byte-accurate. JS `string.length`
// counts UTF-16 code units, which does NOT match `Content-Length` (bytes) when
// the payload contains non-ASCII characters (e.g. PT-BR accents). We track
// stdin in a Buffer and only decode when slicing a complete frame.
let buf = Buffer.alloc(0);
let sessionResponseMode = null;
process.stdin.on('data', (chunk) => {
  buf = Buffer.concat([buf, chunk]);
  while (true) {
    const headerEnd = buf.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      const newline = buf.indexOf('\n');
      if (newline === -1) break;
      const line = buf.slice(0, newline).toString('utf8').trim();
      buf = buf.slice(newline + 1);
      if (line) void handleLine(line, 'line');
      continue;
    }
    const header = buf.slice(0, headerEnd).toString('utf8');
    const m = /Content-Length: (\d+)/i.exec(header);
    if (!m) {
      buf = buf.slice(headerEnd + 4);
      continue;
    }
    const len = Number(m[1]);
    const totalNeeded = headerEnd + 4 + len;
    if (buf.length < totalNeeded) break;
    const body = buf.slice(headerEnd + 4, totalNeeded).toString('utf8');
    buf = buf.slice(totalNeeded);
    void handleLine(body, 'frame');
  }
});

async function handleLine(line, inputMode = 'frame') {
  const responseMode = sessionResponseMode || inputMode;
  sessionResponseMode = responseMode;
  let req;
  try {
    req = JSON.parse(line);
  } catch {
    return;
  }
  const { id, method, params } = req;
  try {
    const result = await dispatch(method, params || {});
    if (id !== undefined) send({ jsonrpc: '2.0', id, result }, responseMode);
  } catch (err) {
    if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32603, message: err?.message || String(err) } }, responseMode);
  }
}

async function dispatch(method, params) {
  switch (method) {
    case 'initialize':
      return { protocolVersion: PROTO_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO };
    case 'tools/list':
      return { tools: TOOL_CATALOGUE };
    case 'tools/call': {
      const { name, arguments: args } = params;
      const out = await dispatchTool(name, args);
      return { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }] };
    }
    case 'ping':
      return {};
    case 'notifications/initialized':
      return null;
    case 'shutdown':
      return null;
    case 'exit':
      process.exit(0);
      return null;
    default:
      throw new Error(`method not supported: ${method}`);
  }
}

function send(msg, responseMode = 'frame') {
  const json = JSON.stringify(msg);
  if (responseMode === 'line') {
    process.stdout.write(`${json}\n`);
    return;
  }
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`);
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

// Self-test entry: `node server.mjs --self-test` runs a non-MCP smoke.
if (process.argv.includes('--self-test')) {
  const tasks = [
    ['nav_health', {}],
    ['nav_list_domains', {}],
    ['nav_list_prisma_models', {}],
    ['nav_list_endpoints', { method: 'GET' }],
    ['nav_start_session', { goal: 'self-test' }],
    ['nav_where_am_i', {}],
  ];
  (async () => {
    for (const [name, args] of tasks) {
      const out = await dispatchTool(name, args);
      console.log('---', name, '---');
      const txt = typeof out === 'string' ? out : JSON.stringify(out, null, 2);
      console.log(txt.slice(0, 1200));
    }
  })().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
