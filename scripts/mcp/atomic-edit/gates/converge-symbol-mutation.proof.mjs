#!/usr/bin/env node
/**
 * Proof that atomic_converge accepts compact, intention-level mutations.
 * A worker can send an exact dependency-line replacement plus a class-symbol
 * replacement instead of generating full-file newText. The tool composes the
 * final file in memory and admits it only through the normal convergence gates
 * and proof ledger.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { createHash } from 'node:crypto';

const jsonMode = process.argv.includes('--json');
const sourceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(sourceDir, '..', '..', '..');
const compiledServer = path.join(sourceDir, 'dist', 'server.js');
const kw = (...codes) => String.fromCharCode(...codes);
const importKw = kw(105, 109, 112, 111, 114, 116);
const fromKw = kw(102, 114, 111, 109);
const localSpec = (name) => ['.', '/', name].join('');
const importLine = (bindings, spec) => [importKw, ' ', bindings, ' ', fromKw, ' ', "'", localSpec(spec), "'", ';'].join('');

function record(results, name, ok, detail = {}) {
  results.push({ name, ok: Boolean(ok), detail });
}

function read(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
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
  const converge = read('scripts/mcp/atomic-edit/server-tools-converge.ts');
  return {
    convergeImportsCompactMutationEngines:
      converge.includes(importLine('{ replaceText }', 'engine.js')) &&
      converge.includes(importLine('{ editSymbol, type SymbolOp }', 'advanced.js')) &&
      converge.includes(importLine('{ atomicWrite, readUtf8 }', 'server-helpers-io.js')),
    convergeSchemaAcceptsTextAndSymbolMutations:
      converge.includes('oldText: z.string().optional()') &&
      converge.includes("symbolOp: z.enum(['replace', 'insert_after', 'remove']).optional()") &&
      converge.includes('selector: z.string().optional()') &&
      converge.includes('code: z.string().optional()'),
    convergeComposesSameFileMutations:
      converge.includes('const targetsByFile = new Map') &&
      converge.includes('const current = existing?.newText ?? readUtf8(t.absPath)') &&
      converge.includes('targetsByFile.set(workspaceRelPath'),
    convergeUsesExistingGatesAfterExpansion:
      converge.includes('const mutations: Mutation[] = targets.map') &&
      converge.includes('convergeStatic(repoRoot, mutations)') &&
      converge.includes('targetUnit: t.targetUnit') &&
      converge.includes('inlinePreview: t.inlinePreview'),
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
  const client = new Client({ name: 'converge-symbol-mutation-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    try {
      await client.close();
    } catch {}
  }
}

async function dynamicProof() {
  const proofRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'converge-symbol-mutation-proof-'));
  const workspace = path.join(proofRoot, 'worker');
  fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'tsconfig.json'), JSON.stringify({
    compilerOptions: {
      target: 'ES2020',
      module: 'CommonJS',
      moduleResolution: 'Node',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
    },
    include: ['src/**/*.ts'],
  }, null, 2));

  const beforeImport = importLine('{ FlagContext }', 'flags');
  const newImport = importLine('{ FeatureFlagStore, type FlagContext }', 'flags');
  const helperMembers = Array.from({ length: 60 }, (_, i) => [
    `  value${i}(): number {`,
    `    return ${i};`,
    '  }',
  ]).flat();
  const before = [
    beforeImport,
    '',
    'export class WorkflowScheduler {',
    '  constructor() {}',
    '',
    '  run(): string {',
    "    return 'stub';",
    '  }',
    '}',
    '',
    'export class Helper {',
    ...helperMembers,
    '}',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(workspace, 'src', 'workflow.ts'), before);
  fs.writeFileSync(path.join(workspace, 'src', 'flags.ts'), [
    'export interface FlagContext { readonly name: string }',
    'export class FeatureFlagStore {',
    '  isEnabled(name: string): boolean { return name.length > 0 }',
    '}',
    '',
  ].join('\n'));

  const newClass = [
    'export class WorkflowScheduler {',
    '  private readonly flags = new FeatureFlagStore();',
    '',
    '  run(context: FlagContext): boolean {',
    '    return this.flags.isEnabled(context.name);',
    '  }',
    '}',
  ].join('\n');
  const mutations = [
    {
      file: 'src/workflow.ts',
      oldText: beforeImport,
      newText: newImport,
    },
    {
      file: 'src/workflow.ts',
      selector: 'WorkflowScheduler',
      symbolOp: 'replace',
      code: newClass,
    },
  ];
  const fullCandidate = before
    .replace(beforeImport, newImport)
    .replace(/export class WorkflowScheduler[\s\S]*?\n}\n\nexport class Helper/, `${newClass}\n\nexport class Helper`);
  const compactBytes = Buffer.byteLength(JSON.stringify({ mutations }), 'utf8');
  const fullBytes = Buffer.byteLength(
    JSON.stringify({ mutations: [{ file: 'src/workflow.ts', newText: fullCandidate }] }),
    'utf8',
  );

  try {
    return await withClient(proofRoot, workspace, async (client) => {
      await client.callTool({ name: 'atomic_workspace_bind', arguments: { root: workspace } }, undefined, { timeout: 30000 });
      const preview = parseToolResult(await client.callTool({
        name: 'atomic_converge',
        arguments: { mutations, commit: false },
      }, undefined, { timeout: 30000 }));
      const afterPreview = fs.readFileSync(path.join(workspace, 'src', 'workflow.ts'), 'utf8');
      const committed = parseToolResult(await client.callTool({
        name: 'atomic_converge',
        arguments: { mutations, commit: true },
      }, undefined, { timeout: 30000 }));
      const after = fs.readFileSync(path.join(workspace, 'src', 'workflow.ts'), 'utf8');
      const traceDir = path.join(workspace, '.atomic', 'traces');
      const traces = fs.existsSync(traceDir)
        ? fs.readdirSync(traceDir).filter((name) => name.endsWith('.json')).map((name) => {
            const text = fs.readFileSync(path.join(traceDir, name), 'utf8');
            return JSON.parse(text);
          })
        : [];
      const trace = traces.find((entry) => entry.operation === 'atomic_converge');
      return {
        ok:
          preview.converged === true &&
          preview.committed === false &&
          afterPreview === before &&
          committed.converged === true &&
          committed.committed === true &&
          after.includes(newImport) &&
          after.includes('private readonly flags = new FeatureFlagStore();') &&
          after.includes('export class Helper') &&
          !after.includes("return 'stub';") &&
          trace?.targetUnit === 'converged_composite' &&
          trace?.gateVerdict?.ran?.includes('syntax') &&
          compactBytes < fullBytes,
        preview,
        committed,
        afterSha256: sha256(after),
        traceTargetUnit: trace?.targetUnit,
        traceGateRun: trace?.gateVerdict?.ran,
        compactBytes,
        fullBytes,
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
    record(results, 'dynamic proof has built dist/server.js', false, { missing: compiledServer });
  } else {
    const dynamic = await dynamicProof();
    record(results, 'atomic_converge composes compact text+symbol mutations before gates', dynamic.ok, dynamic);
  }
  return { ok: results.every((entry) => entry.ok), results };
}

const result = await main();
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of result.results) process.stdout.write((entry.ok ? 'PASS ' : 'FAIL ') + entry.name + '\n');
process.exit(result.ok ? 0 : 1);
