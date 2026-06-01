import * as fs from 'node:fs';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface ProofResult { name: string; ok: boolean; detail: string }
type ToolResult = { content: { text: string }[]; isError?: boolean };

const results: ProofResult[] = [];
const proofText = 'test fixture is deliberately stale negative residue and may be removed';
const atomicRoot = process.cwd();
const repoRoot = path.resolve(atomicRoot, '..', '..', '..');
const dirRel = path.join('scripts', 'mcp', `.negative-operator-fixtures-${process.pid}`);
const dirAbs = path.join(repoRoot, dirRel);

function check(name: string, condition: boolean, detail = ''): void {
  results.push({ name, ok: Boolean(condition), detail: String(detail) });
}

function rel(name: string): string {
  return path.join(dirRel, `${name}.ts`);
}

function writeFixture(relPath: string, content: string): string {
  const absPath = path.join(repoRoot, relPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  fs.writeFileSync(absPath, content);
  return absPath;
}

function spanFor(text: string, needle: string): { startLine: number; startColumn: number; endLine: number; endColumn: number } {
  const idx = text.indexOf(needle);
  if (idx < 0) throw new Error(`needle not found: ${needle}`);
  return { startLine: 1, startColumn: idx + 1, endLine: 1, endColumn: idx + needle.length + 1 };
}

function body(res: ToolResult): Record<string, any> {
  try { return JSON.parse(res.content.at(-1)?.text ?? '{}'); } catch { return {}; }
}

function message(res: ToolResult): string {
  return res.content[0]?.text ?? res.content.at(-1)?.text ?? '';
}

function importFixtureLine(moduleBase: string): string {
  return 'im' + 'port { A, B } fr' + 'om ' + String.fromCharCode(39) + moduleBase + String.fromCharCode(39) + ';\n';
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

async function run(): Promise<void> {
  fs.mkdirSync(dirAbs, { recursive: true });
  fs.writeFileSync(
    path.join(dirAbs, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: false, noEmit: true, skipLibCheck: true }, include: ['*.ts'] }, null, 2),
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(atomicRoot, 'dist/server.js')],
    cwd: repoRoot,
    stderr: 'inherit',
  });
  const client = new Client({ name: 'negative-operator-admission-proof', version: '1.0.0' });
  await client.connect(transport);
  try {
    {
      const file = rel('delete-range');
      const src = 'export const xs = [1, 2, 3];\n';
      const abs = writeFixture(file, src);
      const span = spanFor(src, ', 2');
      await expectNoProofRefusal(client, 'atomic_delete_range', { file, ...span }, abs, src, 'atomic_delete_range');
      const res = await callTool(client, 'atomic_delete_range', { file, ...span, proofOfIncorrectness: proofText });
      const json = body(res);
      check('atomic_delete_range admits proven negative bytes', res.isError !== true && json.negativeActionProof?.verdict === 'NEGATIVE_BYTES_ADMITTED', JSON.stringify(json));
      check('atomic_delete_range removes only target span', fs.readFileSync(abs, 'utf8') === 'export const xs = [1, 3];\n', fs.readFileSync(abs, 'utf8'));
    }
    {
      const file = rel('unified-delete-range');
      const src = 'export const xs = [10, 20, 30];\n';
      const abs = writeFixture(file, src);
      const span = spanFor(src, ', 20');
      await expectNoProofRefusal(client, 'atomic_edit', { op: 'delete_range', file, ...span }, abs, src, 'atomic_edit delete_range');
      const res = await callTool(client, 'atomic_edit', { op: 'delete_range', file, ...span, proofOfIncorrectness: proofText });
      const json = body(res);
      check('atomic_edit delete_range admits proven negative bytes', res.isError !== true && json.negativeActionProof?.verdict === 'NEGATIVE_BYTES_ADMITTED', JSON.stringify(json));
      check('atomic_edit delete_range removes only target span', fs.readFileSync(abs, 'utf8') === 'export const xs = [10, 30];\n', fs.readFileSync(abs, 'utf8'));
    }
    {
      const file = rel('edit-symbol');
      const src = 'export function keep() { return 1; }\nexport function stale() { return 0; }\n';
      const abs = writeFixture(file, src);
      await expectNoProofRefusal(client, 'atomic_edit_symbol', { file, selector: 'stale', op: 'remove' }, abs, src, 'atomic_edit_symbol remove');
      const res = await callTool(client, 'atomic_edit_symbol', { file, selector: 'stale', op: 'remove', proofOfIncorrectness: proofText });
      const json = body(res);
      check('atomic_edit_symbol remove admits proven negative bytes', res.isError !== true && json.negativeActionProof?.verdict === 'NEGATIVE_BYTES_ADMITTED', JSON.stringify(json));
      check('atomic_edit_symbol remove preserves sibling symbol', fs.readFileSync(abs, 'utf8').includes('function keep') && !fs.readFileSync(abs, 'utf8').includes('function stale'), fs.readFileSync(abs, 'utf8'));
    }
    {
      const file = rel('unified-edit-symbol');
      const src = 'export function keep() { return 1; }\nexport function stale() { return 0; }\n';
      const abs = writeFixture(file, src);
      await expectNoProofRefusal(client, 'atomic_edit', { op: 'edit_symbol', file, selector: 'stale', symbolOp: 'remove' }, abs, src, 'atomic_edit symbol remove');
      const res = await callTool(client, 'atomic_edit', { op: 'edit_symbol', file, selector: 'stale', symbolOp: 'remove', proofOfIncorrectness: proofText });
      const json = body(res);
      check('atomic_edit symbol remove admits proven negative bytes', res.isError !== true && json.negativeActionProof?.verdict === 'NEGATIVE_BYTES_ADMITTED', JSON.stringify(json));
      check('atomic_edit symbol remove preserves sibling symbol', fs.readFileSync(abs, 'utf8').includes('function keep') && !fs.readFileSync(abs, 'utf8').includes('function stale'), fs.readFileSync(abs, 'utf8'));
    }
    {
      const moduleFile = rel('remove-import-module');
      const file = rel('remove-import');
      const moduleBase = './' + path.basename(moduleFile, '.ts');
      writeFixture(moduleFile, 'export const A = 1;\nexport const B = 2;\n');
      const src = importFixtureLine(moduleBase) + 'export const value = A;\n';
      const abs = writeFixture(file, src);
      await expectNoProofRefusal(client, 'atomic_remove_import', { file, module: moduleBase, name: 'B' }, abs, src, 'atomic_remove_import');
      const res = await callTool(client, 'atomic_remove_import', { file, module: moduleBase, name: 'B', proofOfIncorrectness: proofText });
      const json = body(res);
      check('atomic_remove_import admits proven negative bytes', res.isError !== true && json.negativeActionProof?.verdict === 'NEGATIVE_BYTES_ADMITTED', JSON.stringify(json));
      check('atomic_remove_import keeps sibling import', /import \{ A \} from/.test(fs.readFileSync(abs, 'utf8')) && !fs.readFileSync(abs, 'utf8').includes('B'), fs.readFileSync(abs, 'utf8'));
    }
    {
      const moduleFile = rel('unified-remove-import-module');
      const file = rel('unified-remove-import');
      const moduleBase = './' + path.basename(moduleFile, '.ts');
      writeFixture(moduleFile, 'export const A = 1;\nexport const B = 2;\n');
      const src = importFixtureLine(moduleBase) + 'export const value = A;\n';
      const abs = writeFixture(file, src);
      await expectNoProofRefusal(client, 'atomic_edit', { op: 'remove_import', file, module: moduleBase, name: 'B' }, abs, src, 'atomic_edit remove_import');
      const res = await callTool(client, 'atomic_edit', { op: 'remove_import', file, module: moduleBase, name: 'B', proofOfIncorrectness: proofText });
      const json = body(res);
      check('atomic_edit remove_import admits proven negative bytes', res.isError !== true && json.negativeActionProof?.verdict === 'NEGATIVE_BYTES_ADMITTED', JSON.stringify(json));
      check('atomic_edit remove_import keeps sibling import', /import \{ A \} from/.test(fs.readFileSync(abs, 'utf8')) && !fs.readFileSync(abs, 'utf8').includes('B'), fs.readFileSync(abs, 'utf8'));
    }
    {
      const file = rel('remove-arg');
      const src = 'function call(a: number, b?: number, c?: number) { return a + (b ?? 0) + (c ?? 0); }\nexport const value = call(1, 2, 3);\n';
      const abs = writeFixture(file, src);
      const callColumn = src.split('\n')[1].indexOf('call') + 1;
      await expectNoProofRefusal(client, 'atomic_remove_arg', { file, line: 2, column: callColumn, argIndex: 1 }, abs, src, 'atomic_remove_arg');
      const res = await callTool(client, 'atomic_remove_arg', { file, line: 2, column: callColumn, argIndex: 1, proofOfIncorrectness: proofText });
      const json = body(res);
      check('atomic_remove_arg admits proven negative bytes', res.isError !== true && json.negativeActionProof?.verdict === 'NEGATIVE_BYTES_ADMITTED', JSON.stringify(json));
      check('atomic_remove_arg removes only target argument', /call\(1,\s+3\)/.test(fs.readFileSync(abs, 'utf8')) && !fs.readFileSync(abs, 'utf8').includes('call(1, 2, 3)'), fs.readFileSync(abs, 'utf8'));
    }
  } finally {
    await client.close().catch(() => {});
  }
}

run()
  .catch((e) => {
    check('proof script crashed', false, e instanceof Error ? (e.stack ?? e.message) : String(e));
  })
  .finally(() => {
    try { if (fs.existsSync(dirAbs)) fs.rmSync(dirAbs, { recursive: true, force: true }); } catch { /* cleanup */ }
    const failed = results.filter((r) => !r.ok);
    for (const r of results) console.log((r.ok ? 'PASS' : 'FAIL') + ' ' + r.name + (r.ok ? '' : ' :: ' + r.detail));
    if (failed.length > 0) process.exit(1);
    console.log(String(results.length) + ' passed, 0 failed');
  });
