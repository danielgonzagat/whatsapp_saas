#!/usr/bin/env node
/**
 * Proof for bounded shallow directory trees in code_readcode.
 * Directory perception is a hot path for ALL-IN Atomic workers. A directory
 * read should expose a compact two-level neighborhood so agents do not spend
 * repeated tool calls discovering the first useful files under common source
 * roots. The tree is bounded, excludes dependency/build trash, and never
 * includes source bodies.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
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

function parseToolResult(result) {
  const text = result.content?.at(-1)?.text ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    return { parseError: text.slice(0, 1000) };
  }
}

function sourceAssertions() {
  const readcode = read('scripts/mcp/atomic-edit/server-tools-readcode.ts');
  return {
    hasBoundedTreeConstants:
      readcode.includes('const SHALLOW_TREE_DEPTH = 2') &&
      readcode.includes('const SHALLOW_TREE_ENTRY_LIMIT = 80') &&
      readcode.includes('SHALLOW_TREE_SKIP'),
    hasTreeBuilder:
      readcode.includes('function readcodeDirectoryTree(') &&
      readcode.includes('function formatShallowTreeSummary('),
    directoryResponsesExposeTree:
      readcode.includes('shallowTree: readcodeDirectoryTree('),
    toolDescriptionExplainsTree:
      readcode.includes('Directory → file listing + bounded shallow tree'),
  };
}

async function withClient(proofRoot, workspace, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [compiledServer],
    cwd: repoRoot,
    stderr: 'pipe',
    env: {
      ...process.env,
      ATOMIC_EDIT_MCP_SELF_HOSTED: '1',
      ATOMIC_EDIT_ALLOW_SELF_HOSTED: '1',
      ATOMIC_EDIT_REPO_ROOT: proofRoot,
      ATOMIC_WORKSPACE_ROOT: workspace,
      ATOMIC_EDIT_ALLOWED_ROOTS: '',
    },
  });
  const client = new Client({ name: 'readcode-shallow-tree-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    try { await client.close(); } catch {}
  }
}

function flattenTree(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (typeof node.path === 'string') out.push(node.path);
  for (const child of node.children ?? []) flattenTree(child, out);
  return out;
}

function treeHasBodyLeak(node) {
  return JSON.stringify(node).includes('return input + 1') || JSON.stringify(node).includes('export function');
}

async function dynamicReadcodeProof() {
  const proofRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'readcode-shallow-tree-proof-'));
  const workspace = path.join(proofRoot, 'worker');
  fs.mkdirSync(path.join(workspace, 'src', '__tests__'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'node_modules', 'left-pad'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'src', 'workflow.ts'), [
    'export function alpha(input: number): number {',
    '  return input + 1;',
    '}',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(workspace, 'src', '__tests__', 'workflow.test.ts'), [
    'export const fixtureName = "workflow";',
    'export const fixtureExpected = 2;',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(workspace, 'node_modules', 'left-pad', 'index.js'), 'module.exports = () => null;\n');
  fs.writeFileSync(path.join(workspace, 'package.json'), '{"type":"module"}\n');

  try {
    return await withClient(proofRoot, workspace, async (client) => {
      const root = parseToolResult(await client.callTool(
        { name: 'code_readcode', arguments: { path: '.' } },
        undefined,
        { timeout: 30000 },
      ));
      const src = parseToolResult(await client.callTool(
        { name: 'code_readcode', arguments: { path: 'src' } },
        undefined,
        { timeout: 30000 },
      ));
      const batch = parseToolResult(await client.callTool(
        { name: 'code_readcode_batch', arguments: { items: [{ path: '.' }, { path: 'src' }] } },
        undefined,
        { timeout: 30000 },
      ));
      const rootPaths = flattenTree(root.shallowTree);
      const srcPaths = flattenTree(src.shallowTree);
      const batchTrees = batch.results?.map((entry) => entry.shallowTree).filter(Boolean) ?? [];
      return {
        ok:
          root.ok === true &&
          root.mode === 'directory' &&
          root.shallowTree?.depth === 2 &&
          root.shallowTree?.entryLimit === 80 &&
          rootPaths.includes('src') &&
          rootPaths.includes('src/__tests__') &&
          rootPaths.includes('src/workflow.ts') &&
          !rootPaths.some((p) => p.startsWith('node_modules')) &&
          src.ok === true &&
          src.shallowTree?.path === 'src' &&
          srcPaths.includes('src/__tests__/workflow.test.ts') &&
          batch.ok === true &&
          batchTrees.length === 2 &&
          batchTrees.every((tree) => tree.depth === 2 && tree.entryLimit === 80) &&
          !treeHasBodyLeak(root.shallowTree) &&
          !treeHasBodyLeak(src.shallowTree),
        root,
        src,
        batch,
        rootPaths,
        srcPaths,
      };
    });
  } finally {
    fs.rmSync(proofRoot, { recursive: true, force: true });
  }
}

async function main() {
  const results = [];
  const source = sourceAssertions();
  for (const [name, ok] of Object.entries(source)) record(results, name, ok, { ok });
  if (!fs.existsSync(compiledServer)) {
    record(results, 'dynamic MCP proof has built dist/server.js', false, { missing: compiledServer });
  } else {
    const dynamic = await dynamicReadcodeProof();
    record(results, 'code_readcode exposes a bounded shallow tree for directory perception', dynamic.ok, dynamic);
  }
  return { ok: results.every((entry) => entry.ok), results };
}

const result = await main();
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of result.results) process.stdout.write((entry.ok ? 'PASS ' : 'FAIL ') + entry.name + '\n');
process.exit(result.ok ? 0 : 1);
