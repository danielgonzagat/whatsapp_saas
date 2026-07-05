#!/usr/bin/env node
/**
 * Proves the MCP list_tools payload stays complete but compact enough for
 * ALL-IN agents to stop losing the first turn on schema/description overhead.
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
  return fs.readFileSync(path.join(sourceDir, rel), 'utf8');
}

function schemaSize(tool) {
  return JSON.stringify(tool.inputSchema ?? {}).length + JSON.stringify(tool.outputSchema ?? {}).length;
}

function hasSchemaDescription(value) {
  if (Array.isArray(value)) return value.some(hasSchemaDescription);
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, 'description')) return true;
  return Object.values(value).some(hasSchemaDescription);
}

async function readToolList() {
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
      ATOMIC_EDIT_ALLOWED_ROOTS: '',
    },
  });
  const client = new Client({ name: 'mcp-tool-list-compact-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    return (await client.listTools()).tools;
  } finally {
    try { await client.close(); } catch {}
  }
}

async function main() {
  const results = [];
  const serverSource = read('server.ts');
  record(
    results,
    'server compacts top-level tool descriptions and strips nested schema descriptions',
    serverSource.includes('const MCP_TOOL_DESCRIPTION_CHAR_LIMIT = 140') &&
      serverSource.includes('function compactToolDescription') &&
      serverSource.includes("'description',") &&
      serverSource.includes('description: compactToolDescription(tool.description)') &&
      serverSource.includes('sanitizeJsonSchema'),
    {
      hasLimit: serverSource.includes('const MCP_TOOL_DESCRIPTION_CHAR_LIMIT = 140'),
      hasCompactor: serverSource.includes('function compactToolDescription'),
      stripsSchemaDescriptions: serverSource.includes("'description',"),
      listUsesCompactor: serverSource.includes('description: compactToolDescription(tool.description)'),
    },
  );

  if (!fs.existsSync(compiledServer)) {
    record(results, 'compiled server exists for dynamic tool-list proof', false, { compiledServer });
    return { ok: false, results };
  }

  const tools = await readToolList();
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const descriptionChars = tools.reduce((total, tool) => total + (tool.description ?? '').length, 0);
  const inputSchemaChars = tools.reduce((total, tool) => total + schemaSize(tool), 0);
  const maxDescriptionChars = Math.max(...tools.map((tool) => (tool.description ?? '').length));
  const schemaDescriptionCount = tools.filter((tool) => hasSchemaDescription(tool.inputSchema) || hasSchemaDescription(tool.outputSchema)).length;

  record(
    results,
    'list_tools remains capability-complete while reducing first-turn payload',
    tools.length >= 100 &&
      byName.has('atomic_exec') &&
      byName.has('atomic_converge') &&
      byName.has('atomic_expand_self') &&
      byName.has('code_readcode') &&
      byName.has('code_readcode_batch') &&
      descriptionChars <= 16000 &&
      maxDescriptionChars <= 140 &&
      inputSchemaChars <= 47000 &&
      schemaDescriptionCount === 0,
    {
      toolCount: tools.length,
      descriptionChars,
      inputSchemaChars,
      maxDescriptionChars,
      schemaDescriptionCount,
      hasAtomicExec: byName.has('atomic_exec'),
      hasAtomicConverge: byName.has('atomic_converge'),
      hasAtomicExpandSelf: byName.has('atomic_expand_self'),
      hasReadcode: byName.has('code_readcode'),
      hasReadcodeBatch: byName.has('code_readcode_batch'),
    },
  );

  const execSchema = byName.get('atomic_exec')?.inputSchema;
  const readcodeSchema = byName.get('code_readcode')?.inputSchema;
  const expandSchema = byName.get('atomic_expand_self')?.inputSchema;
  record(
    results,
    'compact schemas keep required argument structure for high-leverage tools',
    Boolean(execSchema?.properties?.command) &&
      Boolean(readcodeSchema?.properties?.path) &&
      Boolean(expandSchema?.properties?.files),
    {
      atomicExecProperties: Object.keys(execSchema?.properties ?? {}),
      readcodeProperties: Object.keys(readcodeSchema?.properties ?? {}),
      expandSelfProperties: Object.keys(expandSchema?.properties ?? {}),
    },
  );

  return { ok: results.every((entry) => entry.ok), results };
}

const result = await main();
if (jsonMode) process.stdout.write(JSON.stringify(result, null, 2) + '\n');
else for (const entry of result.results) process.stdout.write(`${entry.ok ? 'PASS' : 'FAIL'} ${entry.name}\n`);
process.exit(result.ok ? 0 : 1);
