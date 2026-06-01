import * as fs from 'node:fs';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
interface ProofResult { name: string; ok: boolean; detail: string }
type ToolResult = { content: { text: string }[]; isError?: boolean };
const results: ProofResult[] = [];
const proofText = 'test anchor fixture contains stale negative bytes and replacement is intentional';
const atomicRoot = process.cwd();
const repoRoot = path.resolve(atomicRoot, '..', '..', '..');
const dirRel = path.join('scripts', 'mcp', '.negative-anchor-fixtures-' + process.pid);
const dirAbs = path.join(repoRoot, dirRel);
function check(name: string, condition: boolean, detail = ''): void { results.push({ name, ok: Boolean(condition), detail: String(detail) }); }
function rel(name: string): string { return path.join(dirRel, name + '.ts'); }
function writeFixture(relPath: string, content: string): string { const absPath = path.join(repoRoot, relPath); fs.mkdirSync(path.dirname(absPath), { recursive: true }); fs.writeFileSync(absPath, content); return absPath; }
function body(res: ToolResult): Record<string, unknown> { try { return JSON.parse(res.content.at(-1)?.text ?? '{}') as Record<string, unknown>; } catch { return {}; } }
function message(res: ToolResult): string { return res.content[0]?.text ?? res.content.at(-1)?.text ?? ''; }
function negativeVerdict(json: Record<string, unknown>): string | undefined { const proof = json.negativeActionProof; if (!proof || typeof proof !== 'object') return undefined; const verdict = (proof as Record<string, unknown>).verdict; return typeof verdict === 'string' ? verdict : undefined; }
async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<ToolResult> { return await client.callTool({ name, arguments: args }) as ToolResult; }
async function expectNoProofRefusal(client: Client, tool: string, args: Record<string, unknown>, absPath: string, before: string, label: string): Promise<void> { const res = await callTool(client, tool, args); check(label + ' refuses missing proof', res.isError === true && /proofOfIncorrectness/.test(message(res)), message(res)); check(label + ' preserves bytes after refusal', fs.readFileSync(absPath, 'utf8') === before, fs.readFileSync(absPath, 'utf8')); }
async function expectAdmitted(client: Client, tool: string, args: Record<string, unknown>, absPath: string, expected: string, label: string): Promise<void> { const res = await callTool(client, tool, { ...args, proofOfIncorrectness: proofText }); const json = body(res); check(label + ' admits proven anchor replacement', res.isError !== true && negativeVerdict(json) === 'NEGATIVE_BYTES_ADMITTED', JSON.stringify(json)); check(label + ' persists expected bytes', fs.readFileSync(absPath, 'utf8') === expected, fs.readFileSync(absPath, 'utf8')); }
async function run(): Promise<void> {
  fs.mkdirSync(dirAbs, { recursive: true });
  fs.writeFileSync(path.join(dirAbs, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: false, noEmit: true, skipLibCheck: true }, include: ['*.ts'] }, null, 2));
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.join(atomicRoot, 'dist/server.js')], cwd: repoRoot, stderr: 'inherit' });
  const client = new Client({ name: 'negative-anchor-replacement-proof', version: '1.0.0' });
  await client.connect(transport);
  try {
    { const file = rel('replace-at'); const src = 'export const value = "ABC";\n'; const abs = writeFixture(file, src); const args = { file, mode: 'content', anchor: 'ABC', newText: 'Z' }; await expectNoProofRefusal(client, 'atomic_replace_at', args, abs, src, 'atomic_replace_at content'); await expectAdmitted(client, 'atomic_replace_at', args, abs, 'export const value = "Z";\n', 'atomic_replace_at content'); }
    { const file = rel('unified-replace-at'); const src = 'export const value = "ABC";\n'; const abs = writeFixture(file, src); const args = { op: 'replace_at', file, mode: 'content', anchor: 'ABC', newText: 'Z' }; await expectNoProofRefusal(client, 'atomic_edit', args, abs, src, 'atomic_edit replace_at content'); await expectAdmitted(client, 'atomic_edit', args, abs, 'export const value = "Z";\n', 'atomic_edit replace_at content'); }
    { const file = rel('between'); const src = 'export const value = "alpha ABC omega";\n'; const abs = writeFixture(file, src); const args = { file, startAnchorText: 'alpha ', endAnchorText: ' omega', replacementText: 'Z' }; await expectNoProofRefusal(client, 'atomic_replace_between_anchors', args, abs, src, 'atomic_replace_between_anchors'); await expectAdmitted(client, 'atomic_replace_between_anchors', args, abs, 'export const value = "alpha Z omega";\n', 'atomic_replace_between_anchors'); }
    { const file = rel('region'); const src = 'export const value = "alpha ABC omega";\n'; const abs = writeFixture(file, src); const args = { file, startAnchorText: 'alpha ', endAnchorText: ' omega', oldText: 'ABC', newText: 'Z' }; await expectNoProofRefusal(client, 'atomic_replace_text_in_anchor_region', args, abs, src, 'atomic_replace_text_in_anchor_region'); await expectAdmitted(client, 'atomic_replace_text_in_anchor_region', args, abs, 'export const value = "alpha Z omega";\n', 'atomic_replace_text_in_anchor_region'); }
  } finally { await client.close().catch(() => {}); }
}
run().catch((e) => { check('proof script crashed', false, e instanceof Error ? (e.stack ?? e.message) : String(e)); }).finally(() => { try { if (fs.existsSync(dirAbs)) fs.rmSync(dirAbs, { recursive: true, force: true }); } catch { /* cleanup */ } const failed = results.filter((r) => !r.ok); for (const r of results) console.log((r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (r.ok ? '' : ' :: ' + r.detail)); if (failed.length > 0) process.exit(1); console.log(String(results.length) + ' passed, 0 failed'); });
