#!/usr/bin/env node
/**
 * PROOF - root directory reads should lead agents toward source/test clusters.
 *
 * A common ALL-IN failure mode is reading the project root, receiving only
 * package/tsconfig files as batchNext, then spending serial calls discovering
 * the actual implementation and tests. For small source projects, the bounded
 * shallow tree must see nested entrypoints and batchNext must prioritize source
 * and test files without embedding source bodies in the directory response.
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
const source = fs.readFileSync(path.join(sourceDir, 'server-tools-readcode.ts'), 'utf8');
const compiledServer = path.join(sourceDir, 'dist', 'server.js');

const results = [];
let failures = 0;
function expect(cond, name, detail = undefined) {
  results.push({ name, ok: !!cond, detail });
  if (!cond) failures += 1;
}
function parseToolResult(result) {
  const text = result.content?.at(-1)?.text ?? '{}';
  try { return JSON.parse(text); } catch { return { parseError: text.slice(0, 1000) }; }
}
function flattenTree(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (typeof node.path === 'string') out.push(node.path);
  for (const child of node.children ?? []) flattenTree(child, out);
  return out;
}
function treeHasBodyLeak(node) {
  const serialized = JSON.stringify(node);
  return serialized.includes('return scheduledWorkflowStep') || serialized.includes('class WorkflowScheduler');
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
  const client = new Client({ name: 'readcode-source-batchnext-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    try { await client.close(); } catch {}
  }
}

expect(source.includes('const SHALLOW_TREE_DEPTH = 3'), 'directory shallow tree is deep enough to see nested source entrypoints');
expect(source.includes('function isReadcodeSourceBatchCandidate('), 'readcode has a source/test batch candidate classifier');
expect(source.includes('sourceBatchFiles'), 'batchNext prioritizes source/test candidates before generic package files');

if (fs.existsSync(compiledServer)) {
  const proofRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'readcode-source-batchnext-root-'));
  const workspace = path.join(proofRoot, 'project');
  fs.mkdirSync(path.join(workspace, 'src', 'workflow'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'src', '__tests__'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'src', 'workflow', 'index.ts'), [
    'export class WorkflowScheduler {',
    '  run(): number {',
    '    return scheduledWorkflowStep();',
    '  }',
    '}',
    'export function scheduledWorkflowStep(): number { return 1; }',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(workspace, 'src', '__tests__', 'workflow-scheduler.test.ts'), [
    'const schedulerFixtureName = "WorkflowScheduler";',
    'const schedulerFixturePath = "src/workflow/index.ts";',
    'void schedulerFixtureName;',
    'void schedulerFixturePath;',
    '',
  ].join('\n'));
  fs.writeFileSync(path.join(workspace, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(workspace, 'tsconfig.json'), '{"compilerOptions":{"strict":true}}\n');
  try {
    const dynamic = await withClient(proofRoot, workspace, async (client) => {
      const root = parseToolResult(await client.callTool(
        { name: 'code_readcode', arguments: { path: '.' } },
        undefined,
        { timeout: 30000 },
      ));
      const treePaths = flattenTree(root.shallowTree);
      const batchItems = root.batchNext?.items?.map((item) => item.path) ?? [];
      return { root, treePaths, batchItems };
    });
    expect(dynamic.root.ok === true && dynamic.root.mode === 'directory', 'root directory read succeeds', dynamic.root);
    expect(dynamic.root.shallowTree?.depth === 3, 'root shallow tree reports depth 3', dynamic.root.shallowTree);
    expect(dynamic.treePaths.includes('src/workflow/index.ts'), 'root shallow tree sees nested workflow index file', dynamic.treePaths);
    expect(dynamic.treePaths.includes('src/__tests__/workflow-scheduler.test.ts'), 'root shallow tree sees nested test file', dynamic.treePaths);
    expect(dynamic.batchItems.includes('src/workflow/index.ts'), 'batchNext includes nested implementation file', dynamic.batchItems);
    expect(dynamic.batchItems.includes('src/__tests__/workflow-scheduler.test.ts'), 'batchNext includes nested test file', dynamic.batchItems);
    expect(dynamic.batchItems.indexOf('src/workflow/index.ts') < 8, 'implementation file is near the front of batchNext', dynamic.batchItems);
    expect(!treeHasBodyLeak(dynamic.root.shallowTree), 'directory tree still contains paths only, not source bodies');
  } finally {
    fs.rmSync(proofRoot, { recursive: true, force: true });
  }
} else {
  expect(false, 'compiled dist/server.js exists for dynamic proof', compiledServer);
}

if (jsonMode) console.log(JSON.stringify({ proof: 'readcode-source-batchnext', ok: failures === 0, results }));
else for (const result of results) console.log(`${result.ok ? 'PASS' : 'FAIL'} ${result.name}`);
process.exit(failures === 0 ? 0 : 1);
