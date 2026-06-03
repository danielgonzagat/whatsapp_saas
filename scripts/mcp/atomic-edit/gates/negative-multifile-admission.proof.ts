import * as fs from 'node:fs';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface ProofResult { name: string; ok: boolean; detail: string }
type ToolResult = { content: { text: string }[]; isError?: boolean };

const results: ProofResult[] = [];
const proofText = 'test multi-file fixture contains stale negative bytes and replacement is intentional';
const atomicRoot = process.cwd();
const repoRoot = path.resolve(atomicRoot, '..', '..', '..');
const dirRel = path.join('scripts', 'mcp', '.negative-multifile-fixtures-' + process.pid);
const dirAbs = path.join(repoRoot, dirRel);

function check(name: string, condition: boolean, detail = ''): void {
  results.push({ name, ok: Boolean(condition), detail: String(detail) });
}
function rel(name: string): string { return path.join(dirRel, name + '.ts'); }
function writeFixture(relPath: string, content: string): string {
  const absPath = path.join(repoRoot, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);
  return absPath;
}
function body(res: ToolResult): Record<string, unknown> {
  try { return JSON.parse(res.content.at(-1)?.text ?? '{}') as Record<string, unknown>; } catch { return {}; }
}
function message(res: ToolResult): string { return res.content[0]?.text ?? res.content.at(-1)?.text ?? ''; }
function negativeVerdict(json: Record<string, unknown>): string | undefined {
  const proof = json.negativeActionProof;
  if (!proof || typeof proof !== 'object') return undefined;
  const verdict = (proof as Record<string, unknown>).verdict;
  return typeof verdict === 'string' ? verdict : undefined;
}
async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return await client.callTool({ name, arguments: args }) as ToolResult;
}
async function expectNoProofRefusal(client: Client, tool: string, args: Record<string, unknown>, absPath: string, before: string, label: string): Promise<void> {
  const res = await callTool(client, tool, args);
  check(label + ' refuses missing proof', res.isError === true && /proofOfIncorrectness/.test(message(res)), message(res));
  check(label + ' preserves bytes after refusal', fs.readFileSync(absPath, 'utf8') === before, fs.readFileSync(absPath, 'utf8'));
}
async function expectAdmitted(client: Client, tool: string, args: Record<string, unknown>, absPath: string, expected: string, label: string): Promise<void> {
  const res = await callTool(client, tool, { ...args, proofOfIncorrectness: proofText });
  const json = body(res);
  check(label + ' admits proven multi-file removal', res.isError !== true && negativeVerdict(json) === 'NEGATIVE_BYTES_ADMITTED', JSON.stringify(json));
  check(label + ' persists expected bytes', fs.readFileSync(absPath, 'utf8') === expected, fs.readFileSync(absPath, 'utf8'));
}

async function run(): Promise<void> {
  fs.mkdirSync(dirAbs, { recursive: true });
  fs.writeFileSync(path.join(dirAbs, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: false, noEmit: true, skipLibCheck: true }, include: ['*.ts'] }, null, 2));
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(atomicRoot, 'dist/server.js')], cwd: repoRoot, stderr: 'inherit' });
  const client = new Client({ name: 'negative-multifile-admission-proof', version: '1.0.0' });
  await client.connect(transport);
  try {
    {
      const file = rel('transaction');
      const src = 'export const value = "ABC";\n';
      const abs = writeFixture(file, src);
      const start = src.indexOf('ABC') + 1;
      const args = { plan: [{ file, edits: [{ startLine: 1, startColumn: start, endLine: 1, endColumn: start + 3, newText: 'Z' }] }] };
      await expectNoProofRefusal(client, 'atomic_transaction', args, abs, src, 'atomic_transaction');
      await expectAdmitted(client, 'atomic_transaction', args, abs, 'export const value = "Z";\n', 'atomic_transaction');
    }
    {
      const file = rel('workspace-edit');
      const src = 'export const value = "ABC";\n';
      const abs = writeFixture(file, src);
      const start = src.indexOf('ABC');
      const args = {
        changes: {
          [file]: [{ range: { start: { line: 0, character: start }, end: { line: 0, character: start + 3 } }, newText: 'Z' }],
        },
      };
      await expectNoProofRefusal(client, 'atomic_apply_workspace_edit', args, abs, src, 'atomic_apply_workspace_edit');
      await expectAdmitted(client, 'atomic_apply_workspace_edit', args, abs, 'export const value = "Z";\n', 'atomic_apply_workspace_edit');
    }
  } finally {
    await client.close().catch(() => {});
  }
}

run()
  .catch((e) => { check('proof script crashed', false, e instanceof Error ? (e.stack ?? e.message) : String(e)); })
  .finally(() => {
    try { if (fs.existsSync(dirAbs)) fs.rmSync(dirAbs, { recursive: true, force: true }); } catch { /* cleanup */ }
    const failed = results.filter((r) => !r.ok);
    for (const r of results) console.log((r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (r.ok ? '' : ' :: ' + r.detail));
    if (failed.length > 0) process.exit(1);
    console.log(String(results.length) + ' passed, 0 failed');
  });
