#!/usr/bin/env node
/**
 * graphify-plus-mcp — MCP server that exposes the graphify-plus
 * operational layer on top of CodeGraph.
 *
 * CodeGraph already exposes READ tools (search/context/callers/callees/
 * impact/node/status/files). This server adds ACTION tools that turn the
 * graph into autonomous PRs, validations, and metadata overlays — the
 * pieces that make 100% production drainability possible.
 *
 * Tools exposed:
 *   • hot_clusters                   composite priority ranker
 *                                    (runtime errors + blast radius +
 *                                    doc-freshness drift)
 *   • blast_radius(symbol)           callers+callees+impact in one query
 *   • metadata_for_file(path)        ADR/CLAUDE.md/memory mentions of
 *                                    the file
 *   • route_gap_inventory            route-gap backlog ranked
 *   • runtime_errors(window)         Sentry/Railway errors mapped to
 *                                    graph nodes
 *   • affected_specs(files)          ONLY specs touching changed files
 *                                    (cross-language)
 *   • auto_pr_dispatch(template,...) emit a job into the L13 queue
 *   • playwright_diff(surface)       visual fidelity verification
 *                                    vs reference screenshots
 *   • codacy_drain_jobs(rules,ws)    list eslint --fix-dry-run jobs the
 *                                    pipeline would generate
 *   • session_state                  SESSION_STATE.md content
 *   • taskgraph_lock_status          L11 locks currently held
 *
 * Transport: stdio MCP (JSON-RPC 2.0). Same shape as @colbymchenry/codegraph's
 * `serve --mcp`. Spawned by Claude/Codex/OpenCode/Hermes via the registered
 * mcp_servers entry.
 */

import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const ROOT = process.env.GRAPHIFY_PLUS_ROOT || process.cwd();
const PROTO_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'graphify-plus', version: '0.1.0' };

// ─── MCP server framing ──────────────────────────────────────────────────────

const tools = [
  {
    name: 'hot_clusters',
    description: 'Composite priority ranker over the enriched graph: hot files weighted by runtime errors (Sentry) + blast radius (in-degree) + doc-freshness drift. Returns top-N candidates for the next autonomous PR wave.',
    inputSchema: {
      type: 'object',
      properties: {
        top: { type: 'number', description: 'Number of clusters (default 10)' },
      },
    },
  },
  {
    name: 'blast_radius',
    description: 'For a symbol/file, return callers+callees+inbound+outbound in one consolidated structure (saves 3 codegraph_* calls). Use before changing public API.',
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
    description: 'Returns every ADR, CLAUDE.md note, memory file, doc reference that mentions the given file path. Use to gather all institutional knowledge before refactoring.',
    inputSchema: {
      type: 'object',
      properties: { file: { type: 'string' } },
      required: ['file'],
    },
  },
  {
    name: 'route_gap_inventory',
    description: 'Returns the prioritised list of route gaps (P1/P2/P3/P4). Use to pick the next Wave-11 route conversion target.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'runtime_errors',
    description: 'Returns Sentry/Railway runtime errors mapped to source-tree nodes from the last N hours. Each error includes culprit file + symbol + count + last-seen, ready to feed into hot_clusters.',
    inputSchema: {
      type: 'object',
      properties: {
        hours: { type: 'number', description: 'Window in hours (default 24)' },
      },
    },
  },
  {
    name: 'affected_specs',
    description: 'Given a set of changed files, returns ONLY the spec/test files that exercise them (forward + reverse imports). Cross-language. Use to run minimal validation after edits.',
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
    description: 'Emits a job into the L13 auto-PR queue (graphify-out/auto-pr-jobs/). Loop-runner daemon picks it up within 5 min, opens the PR, CI runs, auto-merger merges when green. Use to ship work without per-PR babysitting.',
    inputSchema: {
      type: 'object',
      properties: {
        template: { type: 'string', enum: ['cluster-tag', 'eslint-fix', 'decompose', 'route-gap-conversion'] },
        files: { type: 'array', items: { type: 'string' } },
        meta: { type: 'object', description: 'Free-form metadata (rule name, target LOC, etc.)' },
      },
      required: ['template', 'files'],
    },
  },
  {
    name: 'playwright_diff',
    description: 'Runs Playwright pixelmatch against the reference screenshot for the given surface slug. Returns ratio + diff PNG path. Use as visual fidelity gate before merging visual PRs.',
    inputSchema: {
      type: 'object',
      properties: {
        slug: { type: 'string', description: 'Surface slug from tools/visual-fidelity/surfaces.json' },
        url: { type: 'string', description: 'Override base URL (default http://localhost:3000)' },
      },
      required: ['slug'],
    },
  },
  {
    name: 'codacy_drain_jobs',
    description: 'Runs codacy-drain.mjs in dry-run mode: returns the eslint --fix-dry-run jobs the pipeline WOULD generate for the given rules and workspaces. Use to size a real-debt drain wave before triggering it.',
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
    description: 'Returns the freshly-computed SESSION_STATE.md (git status, recent commits, PULSE state, protected-file dirtiness, suggested next task). Use as the first call when entering a new session.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'taskgraph_lock_status',
    description: 'Returns the L11 multi-agent file-locks currently held in tools/agent-coordination/locks/. Each lock has cluster name, holder agent, last heartbeat. Use to avoid collisions before claiming a cluster.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ─── Tool implementations ────────────────────────────────────────────────────

async function callTool(name, args) {
  switch (name) {
    case 'hot_clusters': return runScript(['node', join(ROOT, 'tools/graphify-plus/lib/hot.mjs'), `--top=${args?.top ?? 10}`]);
    case 'blast_radius': return blastRadius(args.symbol);
    case 'metadata_for_file': return metadataForFile(args.file);
    case 'route_gap_inventory': return readJsonOr(join(ROOT, 'graphify-out/route-gaps.json'), { routeGaps: [], note: 'run the route gap detector first' });
    case 'runtime_errors': return readJsonOr(join(ROOT, 'graphify-out/shards/runtime-sentry.json'), { errors: [], note: 'run: node tools/graphify-plus/extractors/runtime-sentry.mjs' });
    case 'affected_specs': return runScript(['node', join(ROOT, 'tools/test-affected/run.mjs'), '--files', ...args.files]);
    case 'auto_pr_dispatch': return autoPrDispatch(args.template, args.files, args.meta || {});
    case 'playwright_diff': return runScript(['node', join(ROOT, 'tools/visual-fidelity/playwright-diff.mjs'), `--slug=${args.slug}`, ...(args.url ? [`--url=${args.url}`] : [])]);
    case 'codacy_drain_jobs': return codacyDrainJobs(args?.rules, args?.workspaces);
    case 'session_state': return runScript(['node', join(ROOT, 'tools/session-state/recover.mjs')]);
    case 'taskgraph_lock_status': return taskgraphLockStatus();
    default: throw new Error(`unknown tool: ${name}`);
  }
}

async function blastRadius(symbol) {
  // Compose CodeGraph queries via its CLI (best-effort) + graphify-plus enrichment.
  const [callers, callees] = await Promise.all([
    spawnText(['codegraph', 'query', symbol, '--callers', '--json']).catch(() => '[]'),
    spawnText(['codegraph', 'query', symbol, '--callees', '--json']).catch(() => '[]'),
  ]);
  return { symbol, callers: safeParseJson(callers), callees: safeParseJson(callees) };
}

async function metadataForFile(file) {
  const out = { file, mentions: [] };
  const enriched = await readJsonOr(join(ROOT, 'graphify-out/enriched-graph.json'), null);
  if (enriched?.edges) {
    for (const e of enriched.edges) {
      if (e.kind === 'mentions-file' && e.target === `file:${file}`) {
        out.mentions.push({ source: e.source, meta: e.meta || {} });
      }
    }
  }
  return out;
}

async function autoPrDispatch(template, files, meta) {
  const ts = Date.now();
  const job = {
    title: meta.title || `chore(auto): ${template} on ${files.length} files`,
    body: meta.body || `Auto-dispatched via graphify-plus MCP.\n\nTemplate: ${template}\nFiles: ${files.length}\n\n${files.map((f) => `- \`${f}\``).join('\n')}`,
    branch: meta.branch || `auto/${template}-mcp-${ts}`,
    base: 'origin/main',
    template, files, meta,
  };
  const dir = join(ROOT, 'graphify-out/auto-pr-jobs');
  await mkdir(dir, { recursive: true });
  const out = join(dir, `mcp-${template}-${ts}.json`);
  await writeFile(out, JSON.stringify(job, null, 2));
  return { jobPath: out, queuedAt: new Date(ts).toISOString(), template, fileCount: files.length };
}

async function codacyDrainJobs(rules, workspaces) {
  const ruleArg = rules?.length ? `--rules=${rules.join(',')}` : '';
  const wsArg = workspaces?.length ? `--ws=${workspaces.join(',')}` : '';
  return runScript(['node', join(ROOT, 'tools/auto-pr/codacy-drain.mjs'), '--dry-run', ruleArg, wsArg].filter(Boolean));
}

async function taskgraphLockStatus() {
  const dir = join(ROOT, 'tools/agent-coordination/locks');
  if (!existsSync(dir)) return { locks: [] };
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(dir).catch(() => []);
  const locks = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const lk = await readJsonOr(join(dir, f), null);
    if (lk) locks.push(lk);
  }
  return { locks };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function safeParseJson(s) { try { return JSON.parse(s); } catch { return null; } }

async function readJsonOr(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(await readFile(path, 'utf8')); } catch { return fallback; }
}

function spawnText(args) {
  return new Promise((resolve, reject) => {
    let out = '';
    const p = spawn(args[0], args.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', () => {});
    p.on('exit', (c) => (c === 0 ? resolve(out) : reject(new Error(`${args.join(' ')} → ${c}`))));
    p.on('error', reject);
  });
}

async function runScript(args) {
  const out = await spawnText(args).catch((e) => `error: ${e.message}`);
  return { stdout: out.slice(0, 200_000), cmd: args.join(' ') };
}

// ─── JSON-RPC over stdio ─────────────────────────────────────────────────────

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  buf += chunk;
  while (true) {
    const headerEnd = buf.indexOf('\r\n\r\n');
    if (headerEnd === -1) {
      // Try line-based fallback (older clients)
      const newline = buf.indexOf('\n');
      if (newline === -1) break;
      const line = buf.slice(0, newline).trim();
      buf = buf.slice(newline + 1);
      if (line) void handleLine(line);
      continue;
    }
    const header = buf.slice(0, headerEnd);
    const m = /Content-Length: (\d+)/i.exec(header);
    if (!m) {
      buf = buf.slice(headerEnd + 4);
      continue;
    }
    const len = Number(m[1]);
    if (buf.length < headerEnd + 4 + len) break;
    const body = buf.slice(headerEnd + 4, headerEnd + 4 + len);
    buf = buf.slice(headerEnd + 4 + len);
    void handleLine(body);
  }
});

async function handleLine(line) {
  let req;
  try { req = JSON.parse(line); } catch { return; }
  const { id, method, params } = req;
  try {
    const result = await dispatch(method, params || {});
    if (id !== undefined) send({ jsonrpc: '2.0', id, result });
  } catch (err) {
    if (id !== undefined) send({ jsonrpc: '2.0', id, error: { code: -32603, message: err.message } });
  }
}

async function dispatch(method, params) {
  switch (method) {
    case 'initialize':
      return { protocolVersion: PROTO_VERSION, capabilities: { tools: {} }, serverInfo: SERVER_INFO };
    case 'tools/list':
      return { tools };
    case 'tools/call': {
      const { name, arguments: args } = params;
      const out = await callTool(name, args);
      return { content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out, null, 2) }] };
    }
    case 'ping':
      return {};
    case 'notifications/initialized':
      return null;
    default:
      throw new Error(`method not supported: ${method}`);
  }
}

function send(msg) {
  const json = JSON.stringify(msg);
  // Prefer LSP-style framing for robust clients; many MCP clients also
  // accept newline-delimited JSON, so we write the framed form first
  // followed by a newline.
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}\n`);
}

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
