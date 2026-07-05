#!/usr/bin/env node
/**
 * Proof for compact readCode target metadata and token-bounded full reads.
 * code_readcode is the hot read path for ALL-IN workers, so its default must
 * prefer symbol summaries over large full-content payloads while still allowing
 * an explicit full-content override when the caller proves they need it.
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
  const browseTools = read('scripts/mcp/atomic-edit/server-tools-b.ts');
  return {
    readcodeUsesCompactLocalTarget:
      readcode.includes('function readcodeTargetDetails(displayPath: string): Record<string, unknown>') &&
      readcode.includes("root: 'active-workspace'") &&
      readcode.includes('...readcodeTargetDetails(displayPath),'),
    readcodeNoLongTargetHelper:
      !readcode.includes("import { readUtf8, targetDetails, sha256 }") &&
      !readcode.includes('...targetDetails(absPath, displayPath),'),
    readcodeDefaultFullLimitIsSixK:
      readcode.includes('const CONTEXT_FILE_LIMIT = 6000') &&
      readcode.includes('small (<6K chars by default)') &&
      readcode.includes('Defaults to the normal 6K readCode threshold'),
    readcodeWildcardSelectorsFallBackToFileContext:
      readcode.includes("a.selector?.trim() === '*'") &&
      readcode.includes("item.selector?.trim() === '*'") &&
      readcode.includes('selectorWildcard'),
    readcodeSingleToolHasExplicitOverride:
      readcode.includes('maxFullChars: z') &&
      readcode.includes("const fullLimit = typeof a.maxFullChars === 'number' ? a.maxFullChars : CONTEXT_FILE_LIMIT") &&
      readcode.includes('if (text.length < fullLimit)') &&
      readcode.includes('fullContentThreshold: fullLimit'),
    readcodeBatchKeepsExplicitOverride:
      readcode.includes('maxFullCharsPerFile') &&
      readcode.includes("const hasExplicitFullLimit = typeof a.maxFullCharsPerFile === 'number'") &&
      readcode.includes('const fullLimit = hasExplicitFullLimit ? a.maxFullCharsPerFile! : CONTEXT_FILE_LIMIT'),
    readcodeBatchHasAggregateBudget:
      readcode.includes('const BATCH_CONTEXT_BUDGET = 32000') &&
      readcode.includes('const BATCH_COMPACT_ITEM_THRESHOLD = 5') &&
      readcode.includes('projectedFullChars > BATCH_CONTEXT_BUDGET'),
    readcodeBatchReportsCompactionAndNextReads:
      readcode.includes('batchContextCompacted') &&
      readcode.includes('batchProjectedFullChars') &&
      readcode.includes('fullReadNext') &&
      readcode.includes('Batch aggregate context was compacted'),
    readcodeDirectoryBatchNextUsesShallowTree:
      readcode.includes('function collectShallowTreeFiles') &&
      readcode.includes('readcodeBatchNextForDirectory(dir, entries, shallowTree)') &&
      readcode.includes('Directory exposes a small file cluster in its shallow tree'),
    readcodeDirectoryInlinesSmallFiles:
      readcode.includes('DIRECTORY_INLINE_CONTEXT_BUDGET = 14000') &&
      readcode.includes('DIRECTORY_INLINE_FILE_LIMIT = 6') &&
      readcode.includes('function readcodeInlineFilesForDirectory') &&
      readcode.includes('inlineFiles') &&
      readcode.includes('Inline small files:'),
    readcodeCompactedBatchPayloadIsMinimal:
      readcode.includes('const BATCH_COMPACT_SYMBOL_LIMIT = 8') &&
      readcode.includes('symbolSelectors') &&
      readcode.includes("tool: 'code_readcode_batch'") &&
      readcode.includes('maxFullCharsPerFile: fullLimit') &&
      readcode.includes('fullReadNext,') &&
      !readcode.includes("tool: 'code_readcode',\n                  arguments: { path: displayPath"),
    readcodeFullPayloadAvoidsDuplicatedSymbols:
      readcode.includes('symbolSelectors: o.symbols.map((symbol) => symbol.selector)') &&
      !readcode.includes('content: text,\n            fileSha256: fileSha,\n            symbols: o.symbols') &&
      !readcode.includes('content: text,\n                fileSha256: fileSha,\n                symbols: o.symbols') &&
      !readcode.includes('content: text,\n                  fileSha256: fileSha,\n                  symbols: o.symbols'),
    codeBrowseAdvertisesBatchNext:
      browseTools.includes('function browseBatchNextForDirectory') &&
      browseTools.includes("tool: 'code_readcode_batch'") &&
      browseTools.includes('call code_readcode_batch from batchNext') &&
      browseTools.includes('batchNext,') &&
      browseTools.includes('browseWorkspaceDisplayPath') &&
      browseTools.includes("root: 'active-workspace'") &&
      browseTools.includes('browseDirectoryTree(dir, absPath)'),
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
  const client = new Client({ name: 'readcode-compact-target-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    try { await client.close(); } catch {}
  }
}

function containsAbsoluteLeak(body, proofRoot, workspace) {
  const text = JSON.stringify(body);
  return text.includes(proofRoot) || text.includes(workspace) || text.includes('"absPath"') || text.includes('"repoRoot"');
}

async function dynamicReadcodeProof() {
  const proofRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'readcode-compact-target-proof-'));
  const workspace = path.join(proofRoot, 'worker');
  fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'src', 'example.ts'), [
    'export function alpha(input: number): number {',
    '  return input + 1;',
    '}',
    '',
    'export function beta(input: string): string {',
    '  return input.toUpperCase();',
    '}',
    '',
  ].join('\n'));
  fs.writeFileSync(
    path.join(workspace, 'src', 'medium.ts'),
    'export const medium = ' + JSON.stringify('x'.repeat(3600)) + ';\n',
  );
  fs.writeFileSync(path.join(workspace, 'package.json'), '{"type":"module"}\n');
  fs.mkdirSync(path.join(workspace, 'src', 'cluster'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'src', 'cluster', 'alpha.ts'), 'export const alpha = 1;\n');
  fs.writeFileSync(path.join(workspace, 'src', 'cluster', 'beta.ts'), 'export function beta(): number {\n  return 2;\n}\n');
  for (let i = 0; i < 10; i += 1) {
    fs.writeFileSync(
      path.join(workspace, 'src', `chunk-${i}.ts`),
      [
        `export function chunk${i}(): string {`,
        '  return ' + JSON.stringify('x'.repeat(3600)) + ';',
        '}',
        '',
      ].join('\n'),
    );
  }

  try {
    return await withClient(proofRoot, workspace, async (client) => {
      const dir = parseToolResult(await client.callTool({ name: 'code_readcode', arguments: { path: 'src' } }, undefined, { timeout: 30000 }));
      const inlineDir = parseToolResult(await client.callTool({ name: 'code_readcode', arguments: { path: 'src/cluster' } }, undefined, { timeout: 30000 }));
      const browseDir = parseToolResult(await client.callTool({ name: 'code_browse', arguments: { dir: 'src' } }, undefined, { timeout: 30000 }));
      const file = parseToolResult(await client.callTool({ name: 'code_readcode', arguments: { path: 'src/example.ts' } }, undefined, { timeout: 30000 }));
      const mediumDefault = parseToolResult(await client.callTool({ name: 'code_readcode', arguments: { path: 'src/medium.ts' } }, undefined, { timeout: 30000 }));
      const mediumOverride = parseToolResult(await client.callTool({ name: 'code_readcode', arguments: { path: 'src/medium.ts', maxFullChars: 5000 } }, undefined, { timeout: 30000 }));
      const batch = parseToolResult(await client.callTool({
        name: 'code_readcode_batch',
        arguments: { items: [{ path: 'src/example.ts' }, { path: 'src/example.ts', selector: 'beta' }] },
      }, undefined, { timeout: 30000 }));
      const symbols = parseToolResult(await client.callTool({
        name: 'code_read_symbols_batch',
        arguments: { items: [{ path: 'src/example.ts', selector: 'alpha' }] },
      }, undefined, { timeout: 30000 }));
      const compactItems = Array.from({ length: 10 }, (_, i) => ({ path: `src/chunk-${i}.ts` }));
      const compactBatch = parseToolResult(await client.callTool({
        name: 'code_readcode_batch',
        arguments: { items: compactItems },
      }, undefined, { timeout: 30000 }));
      const explicitBatch = parseToolResult(await client.callTool({
        name: 'code_readcode_batch',
        arguments: { items: compactItems, maxFullCharsPerFile: 5000 },
      }, undefined, { timeout: 30000 }));
      const compactEntries = compactBatch.results ?? [];
      const explicitEntries = explicitBatch.results ?? [];
      const dirBatchNextPaths = (dir.batchNext?.items ?? []).map((item) => item.path);
      const browseBatchNextPaths = (browseDir.batchNext?.items ?? []).map((item) => item.path);
      const bodies = { dir, inlineDir, browseDir, file, mediumDefault, mediumOverride, batch, symbols, compactBatch, explicitBatch };
      const noLeaks = Object.values(bodies).every((body) => !containsAbsoluteLeak(body, proofRoot, workspace));
      return {
        ok:
          dir.ok === true &&
          dir.target?.file === 'src' &&
          dir.target?.root === 'active-workspace' &&
          dir.batchNext?.tool === 'code_readcode_batch' &&
          dirBatchNextPaths.includes('src/chunk-0.ts') &&
          dirBatchNextPaths.includes('src/example.ts') &&
          dirBatchNextPaths.length >= 8 &&
          inlineDir.ok === true &&
          inlineDir.mode === 'directory' &&
          inlineDir.inlineFileCount === 2 &&
          inlineDir.inlineContextBudget === 14000 &&
          Array.isArray(inlineDir.inlineFiles) &&
          inlineDir.inlineFiles.length === 2 &&
          inlineDir.inlineFiles.every((entry) => entry.mode === 'full' && entry.target?.root === 'active-workspace' && typeof entry.content === 'string' && Array.isArray(entry.symbolSelectors)) &&
          inlineDir.inlineFiles.some((entry) => entry.file === 'src/cluster/alpha.ts' && entry.content.includes('alpha = 1')) &&
          inlineDir.inlineFiles.some((entry) => entry.file === 'src/cluster/beta.ts' && entry.content.includes('function beta')) &&
          browseDir.ok === true &&
          browseDir.target?.root === 'active-workspace' &&
          browseDir.target?.file === 'src' &&
          browseDir.batchNext?.tool === 'code_readcode_batch' &&
          browseBatchNextPaths.includes('src/chunk-0.ts') &&
          browseBatchNextPaths.includes('src/example.ts') &&
          browseBatchNextPaths.length >= 8 &&
          file.ok === true &&
          file.target?.file === 'src/example.ts' &&
          file.target?.root === 'active-workspace' &&
          file.mode === 'full' &&
          file.fullContentThreshold === 6000 &&
          typeof file.content === 'string' &&
          Array.isArray(file.symbolSelectors) &&
          typeof file.symbols === 'undefined' &&
          mediumDefault.ok === true &&
          mediumDefault.mode === 'full' &&
          mediumDefault.fullContentThreshold === 6000 &&
          typeof mediumDefault.content === 'string' &&
          Array.isArray(mediumDefault.symbolSelectors) &&
          typeof mediumDefault.symbols === 'undefined' &&
          mediumOverride.ok === true &&
          mediumOverride.mode === 'full' &&
          mediumOverride.fullContentThreshold === 5000 &&
          typeof mediumOverride.content === 'string' &&
          Array.isArray(mediumOverride.symbolSelectors) &&
          typeof mediumOverride.symbols === 'undefined' &&
          batch.ok === true &&
          batch.results?.every((entry) => entry.target?.root === 'active-workspace') &&
          symbols.ok === true &&
          symbols.results?.every((entry) => entry.target?.file === 'src/example.ts') &&
          compactBatch.ok === true &&
          compactBatch.batchContextCompacted === true &&
          compactBatch.batchProjectedFullChars > compactBatch.batchContextBudget &&
          compactEntries.length === 10 &&
          compactEntries.every(
            (entry) =>
              entry.mode === 'summary' &&
              entry.batchContextCompacted === true &&
              typeof entry.content === 'undefined' &&
              typeof entry.symbols === 'undefined' &&
              Array.isArray(entry.symbolSelectors) &&
              entry.symbolSelectors.length <= 8 &&
              typeof entry.fullReadNext === 'undefined',
          ) &&
          compactBatch.fullReadNext?.tool === 'code_readcode_batch' &&
          compactBatch.fullReadNext?.arguments?.maxFullCharsPerFile === 6000 &&
          compactBatch.fullReadNext?.arguments?.items?.length === 10 &&
          explicitBatch.ok === true &&
          explicitBatch.batchContextCompacted === false &&
          explicitEntries.length === 10 &&
          explicitEntries.every((entry) => entry.mode === 'full' && typeof entry.content === 'string') &&
          noLeaks,
        bodies,
        dirBatchNextPaths,
        browseBatchNextPaths,
        noLeaks,
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
    record(results, 'readCode target metadata is compact and default full reads are bounded', dynamic.ok, dynamic);
  }
  return { ok: results.every((entry) => entry.ok), results };
}

const result = await main();
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of result.results) process.stdout.write((entry.ok ? 'PASS ' : 'FAIL ') + entry.name + '\n');
process.exit(result.ok ? 0 : 1);
