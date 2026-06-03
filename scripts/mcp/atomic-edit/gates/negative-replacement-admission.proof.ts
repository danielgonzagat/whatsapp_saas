import * as fs from 'node:fs';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface ProofResult { name: string; ok: boolean; detail: string }
type ToolResult = { content: { text: string }[]; isError?: boolean };
type Span = { startLine: number; startColumn: number; endLine: number; endColumn: number };

const results: ProofResult[] = [];
const proofText = 'test fixture contains stale negative bytes and replacement is intentional';
const atomicRoot = process.cwd();
const repoRoot = path.resolve(atomicRoot, '..', '..', '..');
const dirRel = path.join('scripts', 'mcp', '.negative-replacement-fixtures-' + process.pid);
const dirAbs = path.join(repoRoot, dirRel);

function check(name: string, condition: boolean, detail = ''): void {
  results.push({ name, ok: Boolean(condition), detail: String(detail) });
}

function rel(name: string): string {
  return path.join(dirRel, name + '.ts');
}

function writeFixture(relPath: string, content: string): string {
  const absPath = path.join(repoRoot, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);
  return absPath;
}

function spanFor(text: string, needle: string): Span {
  const idx = text.indexOf(needle);
  if (idx < 0) throw new Error('needle not found: ' + needle);
  return { startLine: 1, startColumn: idx + 1, endLine: 1, endColumn: idx + needle.length + 1 };
}

function body(res: ToolResult): Record<string, unknown> {
  try { return JSON.parse(res.content.at(-1)?.text ?? '{}') as Record<string, unknown>; } catch { return {}; }
}

function message(res: ToolResult): string {
  return res.content[0]?.text ?? res.content.at(-1)?.text ?? '';
}

function negativeVerdict(json: Record<string, unknown>): string | undefined {
  const proof = json.negativeActionProof;
  if (!proof || typeof proof !== 'object') return undefined;
  const verdict = (proof as Record<string, unknown>).verdict;
  return typeof verdict === 'string' ? verdict : undefined;
}

async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return await client.callTool({ name, arguments: args }) as ToolResult;
}

async function expectNoProofRefusal(
  client: Client,
  tool: string,
  args: Record<string, unknown>,
  absPath: string,
  before: string,
  label: string,
): Promise<void> {
  const res = await callTool(client, tool, args);
  check(label + ' refuses missing proof', res.isError === true && /proofOfIncorrectness/.test(message(res)), message(res));
  check(label + ' preserves bytes after refusal', fs.readFileSync(absPath, 'utf8') === before, fs.readFileSync(absPath, 'utf8'));
}

async function expectAdmitted(
  client: Client,
  tool: string,
  args: Record<string, unknown>,
  absPath: string,
  expected: string,
  label: string,
): Promise<void> {
  const res = await callTool(client, tool, { ...args, proofOfIncorrectness: proofText });
  const json = body(res);
  check(label + ' admits proven replacement removal', res.isError !== true && negativeVerdict(json) === 'NEGATIVE_BYTES_ADMITTED', JSON.stringify(json));
  check(label + ' persists expected bytes', fs.readFileSync(absPath, 'utf8') === expected, fs.readFileSync(absPath, 'utf8'));
}

async function run(): Promise<void> {
  fs.mkdirSync(dirAbs, { recursive: true });
  fs.writeFileSync(path.join(dirAbs, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: false, noEmit: true, skipLibCheck: true }, include: ['*.ts'] }, null, 2));
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(atomicRoot, 'dist/server.js')], cwd: repoRoot, stderr: 'inherit' });
  const client = new Client({ name: 'negative-replacement-admission-proof', version: '1.0.0' });
  await client.connect(transport);
  try {
    {
      const file = rel('replace-text');
      const src = 'export const value = "ABC";\n';
      const abs = writeFixture(file, src);
      const args = { file, oldText: 'ABC', newText: 'Z' };
      await expectNoProofRefusal(client, 'atomic_replace_text', args, abs, src, 'atomic_replace_text');
      await expectAdmitted(client, 'atomic_replace_text', args, abs, 'export const value = "Z";\n', 'atomic_replace_text');
    }
    {
      const file = rel('unified-replace-text');
      const src = 'export const value = "ABC";\n';
      const abs = writeFixture(file, src);
      const args = { op: 'replace_text', file, oldText: 'ABC', newText: 'Z' };
      await expectNoProofRefusal(client, 'atomic_edit', args, abs, src, 'atomic_edit replace_text');
      await expectAdmitted(client, 'atomic_edit', args, abs, 'export const value = "Z";\n', 'atomic_edit replace_text');
    }
    {
      const file = rel('replace-range');
      const src = 'export const value = "ABC";\n';
      const abs = writeFixture(file, src);
      const span = spanFor(src, 'ABC');
      const args = { file, ...span, newText: 'Z' };
      await expectNoProofRefusal(client, 'atomic_replace_range', args, abs, src, 'atomic_replace_range');
      await expectAdmitted(client, 'atomic_replace_range', args, abs, 'export const value = "Z";\n', 'atomic_replace_range');
    }
    {
      const file = rel('unified-replace-range');
      const src = 'export const value = "ABC";\n';
      const abs = writeFixture(file, src);
      const span = spanFor(src, 'ABC');
      const args = { op: 'replace_range', file, ...span, newText: 'Z' };
      await expectNoProofRefusal(client, 'atomic_edit', args, abs, src, 'atomic_edit replace_range');
      await expectAdmitted(client, 'atomic_edit', args, abs, 'export const value = "Z";\n', 'atomic_edit replace_range');
    }
    {
      const file = rel('replace-literal');
      const src = 'export const value = "ABC";\n';
      const abs = writeFixture(file, src);
      const args = { file, currentText: '"ABC"', newText: '"Z"' };
      await expectNoProofRefusal(client, 'atomic_replace_literal', args, abs, src, 'atomic_replace_literal');
      await expectAdmitted(client, 'atomic_replace_literal', args, abs, 'export const value = "Z";\n', 'atomic_replace_literal');
    }
    {
      const file = rel('unified-replace-literal');
      const src = 'export const value = "ABC";\n';
      const abs = writeFixture(file, src);
      const args = { op: 'replace_literal', file, oldText: '"ABC"', newText: '"Z"' };
      await expectNoProofRefusal(client, 'atomic_edit', args, abs, src, 'atomic_edit replace_literal');
      await expectAdmitted(client, 'atomic_edit', args, abs, 'export const value = "Z";\n', 'atomic_edit replace_literal');
    }
    {
      const file = rel('apply-edits');
      const src = 'export const value = "ABC";\n';
      const abs = writeFixture(file, src);
      const span = spanFor(src, 'ABC');
      const args = { file, edits: [{ start: { line: span.startLine, column: span.startColumn }, end: { line: span.endLine, column: span.endColumn }, newText: 'Z' }] };
      await expectNoProofRefusal(client, 'atomic_apply_edits', args, abs, src, 'atomic_apply_edits');
      await expectAdmitted(client, 'atomic_apply_edits', args, abs, 'export const value = "Z";\n', 'atomic_apply_edits');
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
