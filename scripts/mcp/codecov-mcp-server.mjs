#!/usr/bin/env node
// Codecov MCP server — persistent, newline-delimited JSON over stdio.
// Uses ESM via .mjs extension. Kept as a fixed file (not temp) so Hermes
// can restart it reliably. Protocol: newline-delimited JSON-RPC 2.0 on stdin/stdout.
import { createInterface } from 'node:readline';
import process from 'node:process';

const PROTO_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'codecov', version: '0.3.0-kloel' };
const API_BASE = 'https://api.codecov.io';

const TOOLS = [
  {
    name: 'codecov_status',
    description: 'Report Codecov MCP configuration without exposing tokens.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_commit_coverage_totals',
    description: 'Return Codecov coverage totals for the configured repository.',
    inputSchema: {
      type: 'object',
      properties: {
        service: { type: 'string' },
        owner: { type: 'string' },
        repo: { type: 'string' },
      },
    },
  },
  {
    name: 'codecov_raw_get',
    description: 'Run a read-only GET against a Codecov API v2 path.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path under /api/v2/, e.g. /api/v2/github/owner/repos/repo/totals' },
      },
      required: ['path'],
    },
  },
];

const PROMPTS = [
  {
    name: 'suggest_tests',
    description: 'Suggest test work from Codecov coverage totals.',
  },
];

function configuredRepo(args = {}) {
  return {
    service: args.service || process.env.GITHUB_SERVICE || 'github',
    owner: args.owner || process.env.GITHUB_OWNER || 'danielgonzagat',
    repo: args.repo || process.env.GITHUB_REPO || 'whatsapp_saas',
  };
}

function status() {
  const repo = configuredRepo();
  return {
    ok: Boolean(process.env.CODECOV_API_KEY),
    hasToken: Boolean(process.env.CODECOV_API_KEY),
    service: repo.service,
    owner: repo.owner,
    repo: repo.repo,
    apiBase: API_BASE,
  };
}

async function codecovGet(path) {
  if (!process.env.CODECOV_API_KEY) {
    return { ok: false, error: 'CODECOV_API_KEY is not configured', ...status() };
  }
  if (!path.startsWith('/api/v2/')) {
    return { ok: false, error: 'Only read-only Codecov /api/v2/ paths are allowed.' };
  }
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${process.env.CODECOV_API_KEY}` },
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { ok: res.ok, status: res.status, statusText: res.statusText, body };
}

async function callTool(name, args = {}) {
  if (name === 'codecov_status') return status();
  if (name === 'get_commit_coverage_totals') {
    const repo = configuredRepo(args);
    return codecovGet(`/api/v2/${repo.service}/${repo.owner}/repos/${repo.repo}/totals`);
  }
  if (name === 'codecov_raw_get') return codecovGet(String(args.path || ''));
  throw new Error(`unknown tool: ${name}`);
}

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function errorResp(id, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code: -32603, message } }) + '\n');
}

async function dispatch(method, params = {}, id) {
  switch (method) {
    case 'initialize':
      return { protocolVersion: PROTO_VERSION, capabilities: { tools: {}, prompts: {} }, serverInfo: SERVER_INFO };
    case 'tools/list':
      return { tools: TOOLS };
    case 'tools/call': {
      const out = await callTool(params.name, params.arguments || {});
      return { content: [{ type: 'text', text: JSON.stringify(out, null, 2) }] };
    }
    case 'prompts/list':
      return { prompts: PROMPTS };
    case 'prompts/get':
      if (params.name !== 'suggest_tests') throw new Error(`unknown prompt: ${params.name}`);
      return {
        messages: [{
          role: 'user',
          content: { type: 'text', text: 'Run get_commit_coverage_totals, identify the lowest-value uncovered files, and suggest concrete tests to add.' },
        }],
      };
    case 'ping':
      return {};
    case 'notifications/initialized':
      return null; // no response for notifications
    case 'shutdown':
      return {};
    case 'exit':
      process.exit(0);
      return {};
    default:
      throw new Error(`method not supported: ${method}`);
  }
}

// Main loop: read newline-delimited JSON from stdin
const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try { req = JSON.parse(trimmed); } catch { return; }
  if (req.id === undefined && req.method === 'notifications/initialized') return;
  dispatch(req.method, req.params || {}, req.id)
    .then((result) => {
      if (result !== null && req.id !== undefined) {
        respond(req.id, result);
      }
    })
    .catch((err) => {
      if (req.id !== undefined) {
        errorResp(req.id, err?.message || String(err));
      }
    });
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
// Don't exit on EPIPE — just ignore
process.stdout.on('error', (e) => { if (e.code !== 'EPIPE') throw e; });
