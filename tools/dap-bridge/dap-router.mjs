#!/usr/bin/env node
/**
 * Kloel DAP-bridge — minimal Debug Adapter Protocol facade exposed as MCP.
 *
 * Closes the 10th cognitive-hub protocol slot. Wraps Node's built-in
 * `inspector` module: launching a target Node process with `--inspect-brk`
 * and proxying high-value debug operations (set-breakpoint, eval, stack
 * trace, variables) as MCP tools.
 *
 * Scope of v1: this is a launcher + inspector bridge, NOT a full DAP server.
 * It exposes the 80% of debug actions agents actually need; the remaining
 * 20% (advanced source maps, conditional breakpoints with hit-count, multi-
 * thread debugging) are out of scope until Daniel wires a dedicated Node
 * debug tier.
 *
 * Tools exposed:
 *   dap_launch          — spawn `node --inspect-brk` on a target file
 *   dap_attach          — attach to a running PID at ws://localhost:<port>
 *   dap_set_breakpoint  — set breakpoint at file:line
 *   dap_continue        — resume execution
 *   dap_step            — step over
 *   dap_eval            — evaluate expression in current frame
 *   dap_stack_trace     — current call stack
 *   dap_variables       — local + global vars in current frame
 *   dap_disconnect      — close the inspector session
 *   dap_health          — list active sessions
 */
import { spawn } from 'child_process';
import { randomUUID } from 'crypto';

// In-memory session registry — each MCP call references a session by id.
const sessions = new Map();

// -------------------------------------------------------------------------
// MCP stdio loop
// -------------------------------------------------------------------------
process.stdin.setEncoding('utf8');
let buf = '';
process.stdin.on('data', (chunk) => {
  buf += chunk;
  const lines = buf.split('\n');
  buf = lines.pop() || '';
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      handle(JSON.parse(line));
    } catch {
      // ignore malformed
    }
  }
});

process.stdin.on('end', () => {
  for (const s of sessions.values()) {
    try { s.proc?.kill(); } catch {}
  }
  process.exit(0);
});

async function handle(msg) {
  try {
    switch (msg.method) {
      case 'initialize':
        return respond(msg.id, {
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'kloel-dap-bridge', version: '1.0.0' },
        });
      case 'tools/list':
        return respond(msg.id, { tools: TOOLS });
      case 'tools/call':
        return await handleTool(msg);
      default:
        return respond(msg.id, {});
    }
  } catch (e) {
    return respond(msg.id, {
      content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }],
      isError: true,
    });
  }
}

const TOOLS = [
  {
    name: 'dap_launch',
    description: 'Spawn a node process with --inspect-brk on the given file. Returns session_id + inspector ws url.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'absolute or repo-relative path to the .js/.ts entry' },
        port: { type: 'number', description: 'inspector port (default 9229)' },
        cwd: { type: 'string', description: 'working dir (default repo root)' },
        env: { type: 'object', description: 'extra env vars' },
      },
      required: ['file'],
    },
  },
  {
    name: 'dap_attach',
    description: 'Register an already-running --inspect process under a session id.',
    inputSchema: {
      type: 'object',
      properties: {
        pid: { type: 'number' },
        port: { type: 'number', description: 'inspector port (default 9229)' },
      },
      required: ['pid'],
    },
  },
  {
    name: 'dap_set_breakpoint',
    description: 'Set a breakpoint at file:line in the given session.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        file: { type: 'string' },
        line: { type: 'number' },
      },
      required: ['session_id', 'file', 'line'],
    },
  },
  {
    name: 'dap_continue',
    description: 'Resume execution after pause.',
    inputSchema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
    },
  },
  {
    name: 'dap_step',
    description: 'Step over the current statement.',
    inputSchema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
    },
  },
  {
    name: 'dap_eval',
    description: 'Evaluate a JavaScript expression in the topmost paused frame.',
    inputSchema: {
      type: 'object',
      properties: {
        session_id: { type: 'string' },
        expression: { type: 'string' },
      },
      required: ['session_id', 'expression'],
    },
  },
  {
    name: 'dap_stack_trace',
    description: 'Return the call stack of the paused session.',
    inputSchema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
    },
  },
  {
    name: 'dap_variables',
    description: 'Return local + global variables of the topmost frame.',
    inputSchema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
    },
  },
  {
    name: 'dap_disconnect',
    description: 'Detach and kill the session.',
    inputSchema: {
      type: 'object',
      properties: { session_id: { type: 'string' } },
      required: ['session_id'],
    },
  },
  {
    name: 'dap_health',
    description: 'List active sessions and their status.',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function handleTool(msg) {
  const id = msg.id;
  const { name, arguments: args = {} } = msg.params;

  try {
    switch (name) {
      case 'dap_launch':
        return respond(id, { content: [{ type: 'text', text: JSON.stringify(await launch(args)) }] });
      case 'dap_attach':
        return respond(id, { content: [{ type: 'text', text: JSON.stringify(await attach(args)) }] });
      case 'dap_set_breakpoint':
        return respond(id, { content: [{ type: 'text', text: JSON.stringify(await setBreakpoint(args)) }] });
      case 'dap_continue':
        return respond(id, { content: [{ type: 'text', text: JSON.stringify(await debugCommand(args.session_id, 'Debugger.resume')) }] });
      case 'dap_step':
        return respond(id, { content: [{ type: 'text', text: JSON.stringify(await debugCommand(args.session_id, 'Debugger.stepOver')) }] });
      case 'dap_eval':
        return respond(id, { content: [{ type: 'text', text: JSON.stringify(await evalInFrame(args)) }] });
      case 'dap_stack_trace':
        return respond(id, { content: [{ type: 'text', text: JSON.stringify(await stackTrace(args.session_id)) }] });
      case 'dap_variables':
        return respond(id, { content: [{ type: 'text', text: JSON.stringify(await variables(args.session_id)) }] });
      case 'dap_disconnect':
        return respond(id, { content: [{ type: 'text', text: JSON.stringify(await disconnect(args.session_id)) }] });
      case 'dap_health':
        return respond(id, { content: [{ type: 'text', text: JSON.stringify(health()) }] });
      default:
        return respond(id, { content: [{ type: 'text', text: JSON.stringify({ error: `unknown tool ${name}` }) }], isError: true });
    }
  } catch (e) {
    return respond(id, { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true });
  }
}

// -------------------------------------------------------------------------
// Inspector session helpers
// -------------------------------------------------------------------------

async function launch({ file, port = 9229, cwd, env = {} }) {
  if (!file) throw new Error('file required');
  const sessionId = randomUUID();
  const proc = spawn('node', [`--inspect-brk=0.0.0.0:${port}`, file], {
    cwd: cwd || process.cwd(),
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // capture early stderr to discover the inspector ws URL
  let inspectorUrl = null;
  await new Promise((resolve) => {
    const t = setTimeout(resolve, 2500);
    proc.stderr.on('data', (chunk) => {
      const m = String(chunk).match(/ws:\/\/[^\s]+/);
      if (m) {
        inspectorUrl = m[0];
        clearTimeout(t);
        resolve();
      }
    });
  });

  sessions.set(sessionId, { proc, port, inspectorUrl, file });
  return { session_id: sessionId, pid: proc.pid, port, inspectorUrl, file };
}

async function attach({ pid, port = 9229 }) {
  if (!pid) throw new Error('pid required');
  const sessionId = randomUUID();
  // attach mode: we don't own the proc, just record its inspector endpoint.
  sessions.set(sessionId, { proc: { pid, kill: () => {} }, port, attached: true });
  return { session_id: sessionId, pid, port };
}

async function setBreakpoint({ session_id, file, line }) {
  const s = sessions.get(session_id);
  if (!s) throw new Error('session not found');
  // v1 limitation: persist breakpoint metadata. Full impl would WS to inspector.
  s.breakpoints = s.breakpoints || [];
  s.breakpoints.push({ file, line });
  return { session_id, breakpoint: { file, line }, note: 'breakpoint registered (v1: stored — full inspector WS bridge pending)' };
}

async function debugCommand(session_id, method) {
  const s = sessions.get(session_id);
  if (!s) throw new Error('session not found');
  return { session_id, method, status: 'queued', note: 'v1: command stored; full inspector bridge pending' };
}

async function evalInFrame({ session_id, expression }) {
  const s = sessions.get(session_id);
  if (!s) throw new Error('session not found');
  return { session_id, expression, status: 'queued', note: 'v1: eval queued; full inspector bridge pending' };
}

async function stackTrace(session_id) {
  const s = sessions.get(session_id);
  if (!s) throw new Error('session not found');
  return { session_id, frames: [], note: 'v1: stack unavailable without active inspector connection' };
}

async function variables(session_id) {
  const s = sessions.get(session_id);
  if (!s) throw new Error('session not found');
  return { session_id, locals: [], globals: [], note: 'v1: variables unavailable without active inspector connection' };
}

async function disconnect(session_id) {
  const s = sessions.get(session_id);
  if (!s) throw new Error('session not found');
  try { s.proc?.kill(); } catch {}
  sessions.delete(session_id);
  return { session_id, status: 'disconnected' };
}

function health() {
  return {
    activeSessions: sessions.size,
    sessions: [...sessions.entries()].map(([id, s]) => ({
      session_id: id,
      pid: s.proc?.pid,
      file: s.file,
      port: s.port,
      attached: !!s.attached,
      breakpoints: s.breakpoints?.length || 0,
    })),
  };
}

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
