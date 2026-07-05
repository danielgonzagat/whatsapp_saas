#!/usr/bin/env node
/**
 * Proof for non-duplicative readCode summaries. code_readcode returns source
 * bodies in the structured JSON payload; the human summary must stay compact so
 * OpenCode transcripts do not pay for the same full file/symbol body twice.
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

function parseToolResult(result) {
  const text = result.content?.at(-1)?.text ?? '{}';
  try {
    return JSON.parse(text);
  } catch {
    return { parseError: text.slice(0, 1000) };
  }
}

function humanSummary(result, body) {
  const explicit = result.content?.slice(0, -1).map((entry) => entry.text ?? '').filter(Boolean).join('\n');
  return explicit || body.summaryForHuman || '';
}

function sourceAssertions() {
  const readcode = read('scripts/mcp/atomic-edit/server-tools-readcode.ts');
  return {
    symbolSummaryDoesNotInlineCode:
      readcode.includes('Code is in the structured JSON payload.') &&
      !readcode.includes('`${grammar ?? \'\'}\\n${r.code}\\n`'),
    fullSummaryDoesNotInlineContent:
      readcode.includes('Content is in the structured JSON payload.') &&
      !readcode.includes('`${grammar ?? \'\'}\\n${text}\\n`'),
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
  const client = new Client({ name: 'readcode-nonduplicative-summary-proof', version: '1.0.0' });
  try {
    await client.connect(transport);
    return await fn(client);
  } finally {
    try { await client.close(); } catch {}
  }
}

async function dynamicReadcodeProof() {
  const proofRoot = path.join(repoRoot, '.atomic', 'readcode-nonduplicative-summary-proof-' + process.pid + '-' + Date.now());
  const workspace = path.join(proofRoot, 'worker');
  const fixture = [
    'export function alpha(input: number): number {',
    '  return input + 1;',
    '}',
    '',
    'export function beta(input: string): string {',
    '  return input.toUpperCase();',
    '}',
    '',
  ].join('\n');
  fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'src', 'example.ts'), fixture);
  fs.writeFileSync(path.join(workspace, 'package.json'), '{"type":"module"}\n');

  try {
    return await withClient(proofRoot, workspace, async (client) => {
      const rawFile = await client.callTool({ name: 'code_readcode', arguments: { path: 'src/example.ts' } }, undefined, { timeout: 30000 });
      const rawSymbol = await client.callTool({ name: 'code_readcode', arguments: { path: 'src/example.ts', selector: 'beta' } }, undefined, { timeout: 30000 });
      const file = parseToolResult(rawFile);
      const symbol = parseToolResult(rawSymbol);
      const fileSummary = humanSummary(rawFile, file);
      const symbolSummary = humanSummary(rawSymbol, symbol);
      const fileBodyStillStructured = file.content?.includes('return input + 1;') === true;
      const symbolBodyStillStructured = symbol.code?.includes('return input.toUpperCase();') === true;
      const fileSummaryCompact =
        fileSummary.includes('Content is in the structured JSON payload.') &&
        !fileSummary.includes('return input + 1;') &&
        !fileSummary.includes('return input.toUpperCase();');
      const symbolSummaryCompact =
        symbolSummary.includes('Code is in the structured JSON payload.') &&
        !symbolSummary.includes('return input.toUpperCase();');
      return {
        ok:
          file.ok === true &&
          symbol.ok === true &&
          fileBodyStillStructured &&
          symbolBodyStillStructured &&
          fileSummaryCompact &&
          symbolSummaryCompact,
        fileSummary,
        symbolSummary,
        fileBodyStillStructured,
        symbolBodyStillStructured,
        fileSummaryCompact,
        symbolSummaryCompact,
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
    record(results, 'readCode summaries are compact while structured payload keeps code', dynamic.ok, dynamic);
  }
  return { ok: results.every((entry) => entry.ok), results };
}

const result = await main();
if (jsonMode) process.stdout.write(JSON.stringify(result) + '\n');
else for (const entry of result.results) process.stdout.write((entry.ok ? 'PASS ' : 'FAIL ') + entry.name + '\n');
process.exit(result.ok ? 0 : 1);
