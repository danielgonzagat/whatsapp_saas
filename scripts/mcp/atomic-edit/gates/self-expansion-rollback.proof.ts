import * as fs from 'node:fs';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface ProofResult { name: string; ok: boolean; detail: string }
type ToolResult = { content: { text: string }[]; isError?: boolean };

const results: ProofResult[] = [];
const atomicRoot = process.cwd();
const repoRoot = path.resolve(atomicRoot, '..', '..', '..');
const goodRel = path.join('scripts', 'mcp', 'atomic-edit', `.self-expansion-apply-rollback.${process.pid}.ts`);
const missingRel = path.join('scripts', 'mcp', 'atomic-edit', `.self-expansion-apply-missing.${process.pid}.ts`);
const goodAbs = path.join(repoRoot, goodRel);
const missingAbs = path.join(repoRoot, missingRel);

function check(name: string, condition: boolean, detail = ''): void {
  results.push({ name, ok: Boolean(condition), detail: String(detail) });
}

function message(res: ToolResult): string {
  return res.content[0]?.text ?? res.content.at(-1)?.text ?? '';
}

async function run(): Promise<void> {
  fs.rmSync(goodAbs, { force: true });
  fs.rmSync(missingAbs, { force: true });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(atomicRoot, 'dist/server.js')],
    cwd: repoRoot,
    stderr: 'inherit',
  });
  const client = new Client({ name: 'self-expansion-rollback-proof', version: '1.0.0' });
  await client.connect(transport);
  try {
    const res = await client.callTool({
      name: 'atomic_expand_self',
      arguments: {
        intent: 'prove apply-phase rollback restores earlier self writes',
        files: [
          { op: 'create', file: goodRel, content: 'export const APPLY_ROLLBACK_PROOF = 1;\n' },
          { op: 'replace', file: missingRel, content: 'export const SHOULD_NOT_EXIST = 1;\n' },
        ],
        proofCommands: ['node build.mjs'],
      },
    }) as ToolResult;
    const text = message(res);
    check('apply-phase failure is reported as rollback', res.isError === true && /rolled back/.test(text), text);
    check('created file was rolled back after later apply failure', !fs.existsSync(goodAbs), goodRel);
    check('missing replace target remains absent', !fs.existsSync(missingAbs), missingRel);
  } finally {
    await client.close().catch(() => {});
    fs.rmSync(goodAbs, { force: true });
    fs.rmSync(missingAbs, { force: true });
  }
}

run()
  .catch((e) => {
    check('proof script crashed', false, e instanceof Error ? (e.stack ?? e.message) : String(e));
  })
  .finally(() => {
    const failed = results.filter((r) => !r.ok);
    for (const r of results) console.log((r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (r.ok ? '' : ' :: ' + r.detail));
    if (failed.length > 0) process.exit(1);
    console.log(String(results.length) + ' passed, 0 failed');
  });
