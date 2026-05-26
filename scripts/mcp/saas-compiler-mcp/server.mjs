#!/usr/bin/env node
/**
 * saas-compiler-mcp — MCP server exposing the Wave 11 stack:
 *   • compile_intent(intentPath)        → spec.json + auto-pr job in one call
 *   • intent_to_spec(intentPath)        → spec.json only
 *   • spec_to_code(specPath)            → auto-pr job
 *   • verify_in_prod(specPath, hours)   → SHIP_OK / ROLLBACK / INCONCLUSIVE
 *   • crystallize_stub(route|top)       → emits crystallisation auto-pr jobs
 *   • capture_fingerprint(name, steps)  → records a behavioral fingerprint
 *   • replay_fingerprint(name|all,base) → asserts behavior parity
 *   • twin_up / twin_down / twin_shadow / twin_metrics
 *                                       → production-twin controls
 *
 * Transport: stdio JSON-RPC 2.0 + LSP framing (same as graphify-plus-mcp).
 * Spawned by Claude/Codex/OpenCode/Hermes via the registered mcp_servers
 * entries.
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';

const ROOT = process.env.SAAS_COMPILER_ROOT || process.cwd();
const PROTO_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'saas-compiler', version: '0.1.0' };

const tools = [
  {
    name: 'compile_intent',
    description: 'Full intent→prod compile: reads an intent .md file, generates the executable spec, generates the code (backend module + controller + service + frontend page + tests + fingerprint), and emits the auto-PR job that the loop-runner will ship. Use this to turn one short product description into a queued PR end-to-end.',
    inputSchema: { type: 'object', properties: { intentPath: { type: 'string', description: 'Relative path like intents/recover-cart.md' } }, required: ['intentPath'] },
  },
  {
    name: 'intent_to_spec',
    description: 'Compile only the intent .md into a structured spec .json (entities, flows, invariants, metrics, fingerprint test). No code generated; use compile_intent for the full pipeline.',
    inputSchema: { type: 'object', properties: { intentPath: { type: 'string' } }, required: ['intentPath'] },
  },
  {
    name: 'spec_to_code',
    description: 'Generate concrete file edits from a spec .json and emit the auto-PR job. Use after refining an auto-generated spec.',
    inputSchema: { type: 'object', properties: { specPath: { type: 'string' } }, required: ['specPath'] },
  },
  {
    name: 'verify_in_prod',
    description: 'Post-merge verifier: reads Sentry+Railway telemetry for the given hours window and decides SHIP_OK / ROLLBACK / INCONCLUSIVE. On ROLLBACK, also queues a revert PR job.',
    inputSchema: { type: 'object', properties: { specPath: { type: 'string' }, hours: { type: 'number' } }, required: ['specPath'] },
  },
  {
    name: 'crystallize_stub',
    description: 'Convert one or more stub routes into real implementations that delegate to canonical view components in components/kloel/. Emits one auto-PR job per stub.',
    inputSchema: { type: 'object', properties: { route: { type: 'string', description: 'Specific stub route (e.g. /anuncios). Omit to use top-N.' }, top: { type: 'number', description: 'Number of top-priority stubs (default 5)' } } },
  },
  {
    name: 'capture_fingerprint',
    description: 'Record a behavioral fingerprint (HTTP+DB+queue+webhook expectations). Saves to tools/fingerprint/storage/<name>.fingerprint.json.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' }, steps: { type: 'array' } }, required: ['name'] },
  },
  {
    name: 'replay_fingerprint',
    description: 'Replay a captured fingerprint against a running app (default http://localhost:3000) or sandbox. Returns pass/fail per step.',
    inputSchema: { type: 'object', properties: { name: { type: 'string', description: 'Fingerprint name or "all"' }, base: { type: 'string' }, token: { type: 'string' } }, required: ['name'] },
  },
  { name: 'twin_up', description: 'Bring up the production-twin sandbox (docker compose).', inputSchema: { type: 'object', properties: {} } },
  { name: 'twin_down', description: 'Tear down the production-twin sandbox.', inputSchema: { type: 'object', properties: {} } },
  {
    name: 'twin_shadow',
    description: 'Replay anonymised production traffic against the running twin and emit a per-PR impact report (req/s, error rate, p50/p95/p99 latency).',
    inputSchema: { type: 'object', properties: { logPath: { type: 'string' }, speed: { type: 'number' } }, required: ['logPath'] },
  },
  { name: 'twin_metrics', description: 'Read the most recent twin shadow report.', inputSchema: { type: 'object', properties: {} } },
];

async function callTool(name, args = {}) {
  switch (name) {
    case 'compile_intent': return runScript(['node', join(ROOT, 'tools/saas-compiler/run.mjs'), args.intentPath]);
    case 'intent_to_spec': return runScript(['node', join(ROOT, 'tools/saas-compiler/intent-to-spec.mjs'), args.intentPath]);
    case 'spec_to_code': return runScript(['node', join(ROOT, 'tools/saas-compiler/spec-to-code.mjs'), args.specPath]);
    case 'verify_in_prod': return runScript(['node', join(ROOT, 'tools/saas-compiler/verify-in-prod.mjs'), args.specPath, ...(args.hours ? [`--hours=${args.hours}`] : [])]);
    case 'crystallize_stub': {
      const flags = args.route ? [`--route=${args.route}`] : [`--top=${args.top ?? 5}`];
      return runScript(['node', join(ROOT, 'tools/crystallization/run.mjs'), ...flags]);
    }
    case 'capture_fingerprint': {
      const stepsArg = args.steps ? `--steps=${JSON.stringify(args.steps)}` : '';
      return runScript(['node', join(ROOT, 'tools/fingerprint/capture.mjs'), args.name, stepsArg].filter(Boolean));
    }
    case 'replay_fingerprint': {
      const flags = [args.name, ...(args.base ? [`--base=${args.base}`] : []), ...(args.token ? [`--token=${args.token}`] : [])];
      return runScript(['node', join(ROOT, 'tools/fingerprint/replay.mjs'), ...flags]);
    }
    case 'twin_up': return runScript(['node', join(ROOT, 'tools/production-twin/twin.mjs'), '--up']);
    case 'twin_down': return runScript(['node', join(ROOT, 'tools/production-twin/twin.mjs'), '--down']);
    case 'twin_shadow': return runScript(['node', join(ROOT, 'tools/production-twin/twin.mjs'), `--shadow=${args.logPath}`, ...(args.speed ? [`--speed=${args.speed}`] : [])]);
    case 'twin_metrics': return runScript(['node', join(ROOT, 'tools/production-twin/twin.mjs'), '--metrics']);
    default: throw new Error(`unknown tool: ${name}`);
  }
}

function runScript(args) {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(args[0], args.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout?.on('data', (d) => (out += d.toString()));
    child.stderr?.on('data', (d) => (out += d.toString()));
    child.on('exit', (code) => resolve({ stdout: out.slice(0, 200_000), exitCode: code, cmd: args.join(' ') }));
    child.on('error', (err) => resolve({ stdout: out + `\nERROR: ${err.message}`, exitCode: -1, cmd: args.join(' ') }));
  });
}

// ─── JSON-RPC over stdio (LSP framing) ───────────────────────────────────────
let buf = '';
let sessionResponseMode = null;
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  while (true) {
    const headerEnd = buf.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      const newline = buf.indexOf('\n');
      if (newline === -1) break;
      const line = buf.slice(0, newline).trim();
      buf = buf.slice(newline + 1);
      if (line) void handleLine(line, 'line');
      continue;
    }
    const header = buf.slice(0, headerEnd);
    const m = /Content-Length: (\d+)/i.exec(header);
    if (!m) { buf = buf.slice(headerEnd + 4); continue; }
    const len = Number(m[1]);
    if (buf.length < headerEnd + 4 + len) break;
    const body = buf.slice(headerEnd + 4, headerEnd + 4 + len);
    buf = buf.slice(headerEnd + 4 + len);
    void handleLine(body, 'frame');
  }
});

async function handleLine(line, inputMode = 'frame') {
  const responseMode = sessionResponseMode || inputMode;
  sessionResponseMode = responseMode;
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const { id, method, params } = req;
  try {
    const result = await dispatch(method, params || {});
    if (id !== undefined) send({ jsonrpc: '2.0', id, result }, responseMode);
  } catch (err) {
    if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32603, message: err.message } }, responseMode);
  }
}

async function dispatch(method, params) {
  switch (method) {
    case 'initialize': return { protocolVersion: PROTO_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO };
    case 'tools/list': return { tools };
    case 'tools/call': {
      const { name, arguments: args } = params;
      const out = await callTool(name, args);
      return { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }] };
    }
    case 'ping': return {};
    case 'notifications/initialized': return null;
    default: throw new Error(`method not supported: ${method}`);
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
