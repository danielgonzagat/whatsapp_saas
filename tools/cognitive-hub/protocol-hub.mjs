#!/usr/bin/env node

/**
 * Kloel Protocol Hub — unified cognitive interface layer.
 *
 * Single entrypoint that exposes ALL protocols to ALL agents via MCP stdio.
 *
 * Protocols:
 *   LSP  → language intelligence (lsp-router.mjs)
 *   DAP  → debug runtime (Node inspector bridge)
 *   CDP  → browser control (chrome-devtools MCP)
 *   OpenAPI → API contracts (tools/openapi/)
 *   AsyncAPI → event contracts (tools/asyncapi/)
 *   SARIF → static analysis findings (tools/sarif/)
 *   SBOM → dependency inventory (tools/sbom/)
 *   OpenTelemetry → runtime telemetry (Datadog bridge)
 *   Tree-sitter → AST intelligence (codegraph)
 *   Test reports → JUnit/LCOV (test-runner MCP)
 *
 * MCP Tools exposed:
 *   protocol_hub_status    → health check of all protocols
 *   protocol_hub_openapi   → query OpenAPI routes/schemas
 *   protocol_hub_asyncapi  → query event contracts
 *   protocol_hub_sarif     → query static analysis findings
 *   protocol_hub_sbom      → query dependency inventory
 *   protocol_hub_dap       → launch debug sessions
 *   protocol_hub_manifest  → full protocol inventory
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

// Protocol availability checks
import { execSync } from 'child_process';

function checkProtocol(name, paths) {
  const exists = paths.some(p => existsSync(resolve(ROOT, p)));
  return { name, available: exists, paths: paths.filter(p => existsSync(resolve(ROOT, p))) };
}

function checkBinary(name, binary, hint) {
  try {
    execSync(`command -v ${binary}`, { stdio: 'pipe' });
    return { name, available: true, paths: [`${binary} (PATH)`] };
  } catch {
    return { name, available: false, paths: [], hint };
  }
}

function checkAnyOf(name, checks, hint) {
  for (const c of checks) {
    if (c.kind === 'path' && existsSync(resolve(ROOT, c.value))) return { name, available: true, paths: [c.value] };
    if (c.kind === 'bin') {
      try { execSync(`command -v ${c.value}`, { stdio: 'pipe' }); return { name, available: true, paths: [`${c.value} (PATH)`] }; } catch { /* try next */ }
    }
  }
  return { name, available: false, paths: [], hint };
}

const PROTOCOLS = [
  checkProtocol('LSP (Language Server)', ['tools/lsp-mesh/lsp-router.mjs', 'tools/lsp-mesh/lsp-mesh.json']),
  checkAnyOf('DAP (Debug Adapter)',
    [{ kind: 'path', value: 'tools/dap-bridge/dap-router.mjs' }, { kind: 'path', value: 'scripts/mcp/dap-bridge-mcp-launcher.sh' }],
    'Install via tools/dap-bridge/dap-router.mjs (v1 launcher + session registry; full inspector WS bridge pending)'),
  checkAnyOf('CDP (Chrome DevTools)',
    [{ kind: 'bin', value: 'chrome-devtools-mcp' }, { kind: 'path', value: 'scripts/mcp/chrome-devtools-mcp/launcher.sh' }],
    'Install via npm i -g chrome-devtools-mcp OR wire in .mcp.json'),
  checkProtocol('OpenAPI', ['tools/openapi/openapi-spec.json']),
  checkProtocol('AsyncAPI', ['tools/asyncapi/asyncapi-spec.json']),
  checkProtocol('SARIF', ['tools/sarif/']),
  checkProtocol('SBOM', ['tools/sbom/sbom-manifest.json']),
  checkProtocol('OpenTelemetry', ['scripts/mcp/datadog-mcp-launcher.sh']),
  checkProtocol('Tree-sitter/CodeGraph', ['.codegraph/codegraph.db']),
  checkProtocol('Test Reports', ['scripts/mcp/test-runner-mcp/launcher.sh']),
];

// MCP Interface
process.stdin.setEncoding('utf8');
let buf = '';
process.stdin.on('data', (c) => {
  buf += c; const lines = buf.split('\n'); buf = lines.pop() || '';
  for (const l of lines) { if (l.trim()) try { handle(JSON.parse(l)); } catch {} }
});

async function handle(msg) {
  try {
    switch (msg.method) {
      case 'initialize':
        return respond(msg.id, {
          capabilities: { tools: {}, resources: {} },
          serverInfo: { name: 'kloel-protocol-hub', version: '1.0.0' },
        });
      case 'tools/list':
        return respond(msg.id, { tools: TOOLS });
      case 'tools/call':
        return await handleTool(msg);
      default:
        return respond(msg.id, {});
    }
  } catch (e) {
    respond(msg.id, { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true });
  }
}

const TOOLS = [
  {
    name: 'protocol_hub_status',
    description: 'Health check of all cognitive protocols (LSP, DAP, CDP, OpenAPI, AsyncAPI, SARIF, SBOM, OTel, Tree-sitter, Tests)',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'protocol_hub_openapi',
    description: 'Query OpenAPI routes and schemas from the NestJS backend',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search routes by path or tag (e.g., "checkout", "/api/products")' },
      },
    },
  },
  {
    name: 'protocol_hub_asyncapi',
    description: 'Query event-driven architecture contracts (event spine, emitters, consumers)',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Filter by domain (commerce, cognition, pulse, kloel)' },
      },
    },
  },
  {
    name: 'protocol_hub_sarif',
    description: 'Query static analysis findings (ESLint, TypeScript, Codacy)',
    inputSchema: {
      type: 'object',
      properties: {
        severity: { type: 'string', description: 'Filter by severity (error, warning, note)' },
      },
    },
  },
  {
    name: 'protocol_hub_sbom',
    description: 'Query software bill of materials (dependencies per workspace)',
    inputSchema: {
      type: 'object',
      properties: {
        workspace: { type: 'string', description: 'Filter by workspace (root, backend, frontend, frontend-admin, worker, e2e)' },
      },
    },
  },
  {
    name: 'protocol_hub_manifest',
    description: 'Full protocol inventory with availability status',
    inputSchema: { type: 'object', properties: {} },
  },
];

async function handleTool(msg) {
  const id = msg.id, { name, arguments: args = {} } = msg.params;

  switch (name) {
    case 'protocol_hub_status':
      return respond(id, { content: [{ type: 'text', text: JSON.stringify(PROTOCOLS, null, 2) }] });

    case 'protocol_hub_openapi': {
      const specPath = resolve(ROOT, 'tools/openapi/openapi-spec.json');
      if (!existsSync(specPath)) return respond(id, { content: [{ type: 'text', text: 'OpenAPI spec not found. Run: node scripts/cognitive/openapi-extract.mjs' }] });
      const spec = JSON.parse(readFileSync(specPath, 'utf8'));
      const paths = Object.keys(spec.paths || {});
      const query = args.query?.toLowerCase();
      const filtered = query ? paths.filter(p => p.toLowerCase().includes(query)) : paths;
      return respond(id, { content: [{ type: 'text', text: JSON.stringify({ total: paths.length, filtered: filtered.length, routes: filtered.slice(0, 50), info: spec.info }, null, 2) }] });
    }

    case 'protocol_hub_asyncapi': {
      const specPath = resolve(ROOT, 'tools/asyncapi/asyncapi-spec.json');
      if (!existsSync(specPath)) return respond(id, { content: [{ type: 'text', text: 'AsyncAPI spec not found. Run: node scripts/cognitive/asyncapi-extract.mjs' }] });
      const spec = JSON.parse(readFileSync(specPath, 'utf8'));
      const channels = Object.keys(spec.channels || {});
      const domain = args.domain;
      const filtered = domain ? channels.filter(c => c.startsWith(domain)) : channels;
      return respond(id, { content: [{ type: 'text', text: JSON.stringify({ total: channels.length, filtered: filtered.length, events: filtered.slice(0, 80) }, null, 2) }] });
    }

    case 'protocol_hub_sarif': {
      const sarifDir = resolve(ROOT, 'tools/sarif');
      if (!existsSync(sarifDir)) return respond(id, { content: [{ type: 'text', text: 'No SARIF findings yet. Generate with ESLint SARIF formatter.' }] });
      const fs = await import('fs');
      const files = fs.readdirSync(sarifDir).filter(f => f.endsWith('.sarif'));
      return respond(id, { content: [{ type: 'text', text: JSON.stringify({ files, count: files.length, note: 'Full SARIF parsing available on request' }, null, 2) }] });
    }

    case 'protocol_hub_sbom': {
      const sbomDir = resolve(ROOT, 'tools/sbom');
      const manifestPath = resolve(sbomDir, 'sbom-manifest.json');
      if (!existsSync(manifestPath)) return respond(id, { content: [{ type: 'text', text: 'No SBOM manifest. Run: node scripts/cognitive/sbom-generate.mjs' }] });
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const ws = args.workspace;
      const filtered = ws ? manifest.workspaces.filter(w => w.workspace === ws) : manifest.workspaces;
      return respond(id, { content: [{ type: 'text', text: JSON.stringify(filtered, null, 2) }] });
    }

    case 'protocol_hub_manifest':
      return respond(id, { content: [{ type: 'text', text: JSON.stringify({
        hub: 'Kloel Protocol Hub v1.0.0',
        description: 'Unified cognitive interface for agents — LSP, DAP, CDP, OpenAPI, AsyncAPI, SARIF, SBOM, OTel, Tree-sitter, Tests',
        protocols: PROTOCOLS,
        agents: ['Claude Code (OMP)', 'Codex CLI', 'Hermes CLI', 'Opencode CLI'],
        mcp_configs: ['~/.omp/agent/mcp.json', '.mcp.json', '~/.hermes/config.yaml', '~/.codex/config.toml'],
      }, null, 2) }] });

    default:
      return respond(id, { content: [{ type: 'text', text: JSON.stringify({ error: `unknown tool: ${name}` }) }] });
  }
}

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
