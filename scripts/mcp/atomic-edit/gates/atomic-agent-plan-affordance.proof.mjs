#!/usr/bin/env node
/**
 * Proof that Atomic exposes an explicit planning/progress route for ALL-IN
 * workers, so native todowrite is a measurable bypass instead of tolerated
 * auxiliary behavior.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const compiledServer = path.join(sourceDir, 'dist', 'server.js');

function record(results, name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function read(rel) {
  return fs.readFileSync(path.join(repoRoot, rel), 'utf8');
}

function sourceAssertions() {
  const agent = read('scripts/mcp/atomic-edit/server-tools-agent.ts');
  const surface = read('scripts/mcp/atomic-edit-evolution/opencode-tool-surface-harness.mjs');
  return {
    atomicAgentPlanAdvertisesTodowriteReplacement:
      agent.includes('Use this atomic planning/progress receipt instead of native todowrite'),
    allInClassifierBlocksTodowrite:
      surface.includes("const ALLOWED_AUXILIARY_TOOLS = Object.freeze([])") &&
      surface.includes("'todowrite'") &&
      surface.includes('ATOMIC_NATIVE_TOOL_USED'),
  };
}

async function dynamicToolSchemaProof() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [compiledServer],
    cwd: repoRoot,
    stderr: 'pipe',
    env: {
      ...process.env,
      ATOMIC_EDIT_MCP_SELF_HOSTED: '1',
      ATOMIC_EDIT_ALLOW_SELF_HOSTED: '1',
      ATOMIC_EDIT_REPO_ROOT: repoRoot,
      ATOMIC_WORKSPACE_ROOT: repoRoot,
    },
  });
  const client = new Client({ name: 'atomic-agent-plan-affordance-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const tool = listed.tools.find((candidate) => candidate.name === 'atomic_agent_plan');
    const description = tool?.description ?? '';
    return {
      ok:
        Boolean(tool) &&
        description.includes('atomic planning/progress receipt') &&
        description.includes('instead of native todowrite'),
      description,
    };
  } finally {
    try { await client.close(); } catch {}
  }
}

async function main() {
  const results = [];
  const source = sourceAssertions();
  for (const [name, ok] of Object.entries(source)) record(results, name, ok, { ok });
  if (!fs.existsSync(compiledServer)) {
    record(results, 'dynamic MCP proof has built dist/server.js', false, { missing: compiledServer });
  } else {
    const dynamic = await dynamicToolSchemaProof();
    record(results, 'atomic_agent_plan schema advertises atomic planning route', dynamic.ok, dynamic);
  }
  return { ok: results.every((entry) => entry.ok), results };
}

const result = await main();
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of result.results) process.stdout.write((entry.ok ? 'PASS ' : 'FAIL ') + entry.name + '\n');
process.exit(result.ok ? 0 : 1);
