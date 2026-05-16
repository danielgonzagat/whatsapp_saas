/**
 * Smoke test — real evidence the atomic-edit engine and MCP server work.
 * Run: npx tsx scripts/mcp/atomic-edit/smoke.ts
 * Exit 0 = all assertions + live MCP round-trip passed; non-zero = failure.
 *
 * Part A: pure-engine assertions (range/insert/delete/batch/rename/literal,
 *         validation regression refusal, Expansion Factor math).
 * Part B: spins the actual server via the SDK stdio client and calls a tool
 *         end-to-end against a temp fixture inside the repo.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  applyEdits,
  replaceText,
  renameSymbol,
  replaceLiteral,
  posToOffset,
  wrapRange,
} from './engine.js';
import { outline, readSymbol } from './nav.js';
import {
  editSymbol,
  renameSymbolCrossFile,
  previewDiff,
  characterDiff,
  addNamedImport,
  removeNamedImport,
  replacePropertyValue,
} from './advanced.js';
import { graphemes, measure, graphemeLength } from './textunit.js';
import { buildFounderBlock } from './founder.js';
import { buildTrace, levelFor, shapePayload } from './trace.js';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = ''): void {
  if (cond) {
    passed++;
    process.stdout.write(`  PASS  ${name}\n`);
  } else {
    failed++;
    process.stdout.write(`  FAIL  ${name} ${detail}\n`);
  }
}

async function partA(): Promise<void> {
  process.stdout.write('Part A — engine\n');

  // posToOffset
  check('posToOffset 1:1 = 0', posToOffset('abc\ndef', { line: 1, column: 1 }) === 0);
  check('posToOffset 2:1 = 4', posToOffset('abc\ndef', { line: 2, column: 1 }) === 4);

  // replace_range: 'foo' literal -> null  (the thesis example, by range)
  {
    const src = "const phone = '5511999999999';\n";
    // 'phone = ' is 8 chars after "const " (6) => the literal starts col 15
    const r = applyEdits('a.ts', src, [
      { start: { line: 1, column: 15 }, end: { line: 1, column: 30 }, newText: 'null' },
    ]);
    check(
      'range swap produces null',
      r.newText === 'const phone = null;\n',
      JSON.stringify(r.newText),
    );
    check('range swap validates ok', r.validation.ok && r.validation.language === 'ts');
    check('expansion factor measured', r.expansionFactor > 1, `EF=${r.expansionFactor}`);
  }

  // insert_at
  {
    const r = applyEdits('a.ts', 'const x = 1\n', [
      { start: { line: 1, column: 12 }, end: { line: 1, column: 12 }, newText: ';' },
    ]);
    check('insert semicolon', r.newText === 'const x = 1;\n');
  }

  // delete_range
  {
    const r = applyEdits('a.ts', 'const x = 1 ;\n', [
      { start: { line: 1, column: 12 }, end: { line: 1, column: 13 }, newText: '' },
    ]);
    check('delete stray space', r.newText === 'const x = 1;\n', JSON.stringify(r.newText));
  }

  // validation refusal: introduce a syntax error must be flagged ok=false
  {
    const r = applyEdits('a.ts', 'const x = 1;\n', [
      { start: { line: 1, column: 12 }, end: { line: 1, column: 12 }, newText: ' = = {' },
    ]);
    check(
      'regression detected (ok=false)',
      r.validation.ok === false,
      JSON.stringify(r.validation),
    );
  }

  // pre-existing error tolerated (no regression) — surgical, not "make it worse"
  {
    const broken = 'const x = ;\n'; // already a syntax error
    const r = applyEdits('a.ts', broken, [
      { start: { line: 1, column: 1 }, end: { line: 1, column: 6 }, newText: 'let  ' },
    ]);
    check('pre-existing error tolerated', r.validation.ok === true, JSON.stringify(r.validation));
  }

  // batched non-overlapping
  {
    const src = 'const a = 1;\nconst b = 2;\n';
    const r = applyEdits('a.ts', src, [
      { start: { line: 1, column: 11 }, end: { line: 1, column: 12 }, newText: '10' },
      { start: { line: 2, column: 11 }, end: { line: 2, column: 12 }, newText: '20' },
    ]);
    check(
      'batch applies both',
      r.newText === 'const a = 10;\nconst b = 20;\n',
      JSON.stringify(r.newText),
    );
  }

  // replace_text: unique exact match, validated
  {
    const r = replaceText('a.ts', 'const port = 3000;\n', '3000', '8080');
    check(
      'replace_text unique match',
      r.newText === 'const port = 8080;\n' && r.validation.ok,
      JSON.stringify(r.newText),
    );
  }
  // replace_text: ambiguity refused without occurrence
  {
    let threw = false;
    try {
      replaceText('a.ts', 'let x=1;\nlet x=1;\n', 'x=1', 'x=2');
    } catch {
      threw = true;
    }
    check('replace_text refuses ambiguity', threw);
  }
  // replace_text: occurrence index targets the Nth
  {
    const r = replaceText('a.ts', 'a();\na();\na();\n', 'a()', 'b()', 2);
    check(
      'replace_text occurrence=2',
      r.newText === 'a();\nb();\na();\n',
      JSON.stringify(r.newText),
    );
  }
  // replace_text: syntax-regression refused (the whole point vs builtin edit)
  {
    const r = replaceText('a.ts', 'function f() { return 1; }\n', 'return 1;', 'return = = {');
    check(
      'replace_text refuses syntax regression',
      r.validation.ok === false,
      JSON.stringify(r.validation),
    );
  }

  // overlap rejected
  {
    let threw = false;
    try {
      applyEdits('a.ts', 'abcdef\n', [
        { start: { line: 1, column: 1 }, end: { line: 1, column: 4 }, newText: 'X' },
        { start: { line: 1, column: 2 }, end: { line: 1, column: 5 }, newText: 'Y' },
      ]);
    } catch {
      threw = true;
    }
    check('overlapping batch rejected', threw);
  }

  // scoped rename
  {
    const src = 'function f(userId: string) {\n  return userId.length;\n}\n';
    const r = await renameSymbol('a.ts', src, { line: 1, column: 12 }, 'accountId');
    check(
      'scoped rename both sites',
      r.newText.includes('accountId: string') && r.newText.includes('return accountId.length'),
      JSON.stringify(r.newText),
    );
    check('rename counts references', r.occurrences >= 1, `refs=${r.occurrences}`);
  }

  // literal swap by value (thesis example)
  {
    const src = "const phone = '5511999999999';\nconst other = 'x';\n";
    const r = await replaceLiteral('a.ts', src, "'5511999999999'", 'null');
    check(
      'literal swap -> null',
      r.newText.startsWith('const phone = null;'),
      JSON.stringify(r.newText),
    );
  }

  // literal ambiguity refused
  {
    let threw = false;
    try {
      await replaceLiteral('a.ts', "const a='x';\nconst b='x';\n", "'x'", "'y'");
    } catch {
      threw = true;
    }
    check('ambiguous literal refused without onLine', threw);
  }

  // lever #4: wrap a statement in try-catch (validated, behaviour-preserving)
  {
    const src = 'function f() {\n  doWork();\n}\n';
    const r = wrapRange('a.ts', src, { line: 2, column: 3 }, { line: 2, column: 11 }, 'try-catch');
    check(
      'wrap try-catch validates + structures',
      r.validation.ok &&
        r.newText.includes('try {') &&
        r.newText.includes('doWork()') &&
        r.newText.includes('} catch (error) {'),
      JSON.stringify(r.newText),
    );
  }
  // wrap 'if' without condition is refused (no invented behaviour)
  {
    let threw = false;
    try {
      wrapRange('a.ts', 'x();\n', { line: 1, column: 1 }, { line: 1, column: 4 }, 'if');
    } catch {
      threw = true;
    }
    check('wrap if requires explicit condition', threw);
  }
  // wrap that splits a token → syntax regression refused
  {
    const r = wrapRange(
      'a.ts',
      'const a = 1;\n',
      { line: 1, column: 1 },
      { line: 1, column: 4 },
      'try-catch',
    );
    check(
      'wrap refuses syntax regression',
      r.validation.ok === false,
      JSON.stringify(r.validation),
    );
  }
}

async function partB(): Promise<void> {
  process.stdout.write('Part B — live MCP stdio round-trip\n');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

  const repoRoot = path.resolve(__dirname, '..', '..', '..');
  const fixtureRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-fixture.${process.pid}.ts`);
  const fixtureAbs = path.join(repoRoot, fixtureRel);
  fs.writeFileSync(fixtureAbs, "export const TARGET = '5511999999999';\n");

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['--yes', 'tsx', path.join(__dirname, 'server.ts')],
    cwd: repoRoot,
    stderr: 'inherit',
  });
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    check(
      'server lists all 17 tools (incl. atomic_wrap_range)',
      names.length === 17 &&
        names.includes('atomic_replace_text') &&
        names.includes('atomic_transaction') &&
        names.includes('atomic_wrap_range') &&
        names.includes('code_outline') &&
        names.includes('atomic_edit_symbol') &&
        names.includes('atomic_add_import') &&
        names.includes('atomic_remove_import') &&
        names.includes('atomic_replace_property_value'),
      names.join(','),
    );

    // live sha256 optimistic-concurrency guard
    const sha = (s: string) => require('node:crypto').createHash('sha256').update(s).digest('hex');
    const cur = fs.readFileSync(fixtureAbs, 'utf8');
    const okSha = (await client.callTool({
      name: 'atomic_add_import',
      arguments: {
        file: fixtureRel,
        module: './z',
        name: 'Zed',
        expectedSha256: sha(cur),
        preview: true,
      },
    })) as { content: { text: string }[] };
    check(
      'sha guard passes on correct hash',
      JSON.parse(okSha.content[0].text).ok === true,
      okSha.content[0].text,
    );
    const badSha = (await client.callTool({
      name: 'atomic_add_import',
      arguments: { file: fixtureRel, module: './z', name: 'Zed', expectedSha256: 'deadbeef' },
    })) as { content: { text: string }[]; isError?: boolean };
    check(
      'sha guard refuses on stale hash',
      badSha.isError === true && /sha256 mismatch/.test(badSha.content[0].text),
      badSha.content[0].text,
    );

    const out = (await client.callTool({
      name: 'code_outline',
      arguments: { file: fixtureRel },
    })) as { content: { text: string }[] };
    const ob = JSON.parse(out.content[0].text);
    check('live code_outline ok', ob.ok === true && Array.isArray(ob.symbols), out.content[0].text);

    const prev = (await client.callTool({
      name: 'atomic_insert_at',
      arguments: { file: fixtureRel, line: 1, column: 1, text: '// hdr\n', preview: true },
    })) as { content: { text: string }[] };
    const pb = JSON.parse(prev.content[0].text);
    check(
      'preview dry-run does not write',
      pb.preview === true && pb.changed === false && typeof pb.diff === 'string',
      prev.content[0].text,
    );

    const res = (await client.callTool({
      name: 'atomic_replace_literal',
      arguments: { file: fixtureRel, currentText: "'5511999999999'", newText: 'null' },
    })) as { content: { text: string }[]; isError?: boolean };
    const body = JSON.parse(res.content[0].text);
    check('live literal swap ok', body.ok === true && body.changed === true, res.content[0].text);
    const after = fs.readFileSync(fixtureAbs, 'utf8');
    check(
      'fixture mutated on disk',
      after === 'export const TARGET = null;\n',
      JSON.stringify(after),
    );

    // governance guard must refuse a protected file
    const guarded = (await client.callTool({
      name: 'atomic_insert_at',
      arguments: { file: 'CLAUDE.md', line: 1, column: 1, text: 'x' },
    })) as { content: { text: string }[]; isError?: boolean };
    check(
      'protected file refused',
      guarded.isError === true && /governance-protected/.test(guarded.content[0].text),
      guarded.content[0].text,
    );

    // ── Lever #3: multi-file atomic transaction ──
    const txA = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-tx-a.${process.pid}.ts`);
    const txB = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-tx-b.ts`);
    const txAAbs = path.join(repoRoot, txA);
    const txBAbs = path.join(repoRoot, txB);
    fs.writeFileSync(txAAbs, 'export const A = 1;\n');
    fs.writeFileSync(txBAbs, 'export const B = 2;\n');
    // happy path: both files changed atomically
    const txOk = (await client.callTool({
      name: 'atomic_transaction',
      arguments: {
        plan: [
          {
            file: txA,
            edits: [{ startLine: 1, startColumn: 18, endLine: 1, endColumn: 19, newText: '9' }],
          },
          {
            file: txB,
            edits: [{ startLine: 1, startColumn: 18, endLine: 1, endColumn: 19, newText: '8' }],
          },
        ],
      },
    })) as { content: { text: string }[] };
    const txb = JSON.parse(txOk.content[0].text);
    check(
      'transaction commits all files',
      txb.ok === true &&
        txb.transaction === true &&
        txb.filesWritten === 2 &&
        fs.readFileSync(txAAbs, 'utf8') === 'export const A = 9;\n' &&
        fs.readFileSync(txBAbs, 'utf8') === 'export const B = 8;\n',
      txOk.content[0].text,
    );
    // all-or-nothing: one file would regress → NOTHING written
    const txBad = (await client.callTool({
      name: 'atomic_transaction',
      arguments: {
        plan: [
          {
            file: txA,
            edits: [{ startLine: 1, startColumn: 18, endLine: 1, endColumn: 19, newText: '7' }],
          },
          {
            file: txB,
            edits: [
              { startLine: 1, startColumn: 14, endLine: 1, endColumn: 14, newText: ' = = {' },
            ],
          },
        ],
      },
    })) as { content: { text: string }[]; isError?: boolean };
    check(
      'transaction all-or-nothing on regression',
      txBad.isError === true &&
        /transaction REFUSED/.test(txBad.content[0].text) &&
        fs.readFileSync(txAAbs, 'utf8') === 'export const A = 9;\n', // txA untouched
      txBad.content[0].text,
    );
    for (const f of [txAAbs, txBAbs]) if (fs.existsSync(f)) fs.unlinkSync(f);
  } finally {
    await client.close().catch(() => {});
    if (fs.existsSync(fixtureAbs)) fs.unlinkSync(fixtureAbs);
  }
}

async function partC(): Promise<void> {
  process.stdout.write('Part C — v2 read-side + symbol edits + cross-file rename\n');

  const SRC = [
    'export class UserService {',
    '  async load(id: string) {',
    '    return this.repo.find(id);',
    '  }',
    '}',
    'export function helper(x: number) {',
    '  return x * 2;',
    '}',
    '',
  ].join('\n');

  // outline
  {
    const o = await outline('svc.ts', SRC);
    const sels = o.symbols.map((s) => s.selector);
    check(
      'outline lists scoped symbols',
      sels.includes('UserService') && sels.includes('UserService.load') && sels.includes('helper'),
      sels.join(','),
    );
  }

  // read_symbol scoped
  {
    const r = await readSymbol('svc.ts', SRC, 'UserService.load');
    check('read_symbol returns the method', r.code.includes('async load(id: string)'), r.code);
    check(
      'read_symbol gives a range',
      r.startLine === 2 && r.endLine === 4,
      `${r.startLine}-${r.endLine}`,
    );
  }

  // edit_symbol replace
  {
    const r = await editSymbol(
      'svc.ts',
      SRC,
      'helper',
      'replace',
      'export function helper(x: number) {\n  return x * 3;\n}',
    );
    check(
      'edit_symbol replace ok',
      r.validation.ok && r.newText.includes('x * 3'),
      JSON.stringify(r.validation),
    );
    check('edit_symbol replace kept class', r.newText.includes('class UserService'));
  }

  // edit_symbol insert_after
  {
    const r = await editSymbol(
      'svc.ts',
      SRC,
      'helper',
      'insert_after',
      'export const VERSION = 1;',
    );
    check(
      'edit_symbol insert_after ok',
      r.validation.ok &&
        r.newText.includes('export const VERSION = 1;') &&
        r.newText.includes('function helper'),
      JSON.stringify(r.validation),
    );
  }

  // edit_symbol remove
  {
    const r = await editSymbol('svc.ts', SRC, 'helper', 'remove');
    check(
      'edit_symbol remove ok',
      r.validation.ok &&
        !r.newText.includes('function helper') &&
        r.newText.includes('class UserService'),
      r.newText,
    );
  }

  // edit_symbol rejects syntax-breaking replacement
  {
    const r = await editSymbol('svc.ts', SRC, 'helper', 'replace', 'export function helper( {');
    check(
      'edit_symbol rejects broken code',
      r.validation.ok === false,
      JSON.stringify(r.validation),
    );
  }

  // previewDiff
  {
    const d = previewDiff('a\nb\nc\n', 'a\nB\nc\n', 'x.ts');
    check('previewDiff marks change', d.includes('- b') && d.includes('+ B'), d);
  }

  // cross-file rename via real tsconfig on disk
  {
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const tmpRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-xf.${process.pid}`);
    const tmpAbs = path.join(repoRoot, tmpRel);
    fs.mkdirSync(tmpAbs, { recursive: true });
    try {
      fs.writeFileSync(
        path.join(tmpAbs, 'tsconfig.json'),
        JSON.stringify({ compilerOptions: { strict: false, noEmit: true }, include: ['*.ts'] }),
      );
      fs.writeFileSync(
        path.join(tmpAbs, 'a.ts'),
        'export function compute(seed: number) { return seed + 1; }\n',
      );
      fs.writeFileSync(
        path.join(tmpAbs, 'b.ts'),
        'import { compute } from "./a";\nexport const r = compute(41);\n',
      );
      const r = await renameSymbolCrossFile(
        path.join(tmpAbs, 'a.ts'),
        repoRoot,
        1,
        17, // identifier "compute"
        'calculate',
      );
      const files = [...r.changes.keys()].map((f) => path.basename(f)).sort();
      check(
        'cross-file rename touches both files',
        files.length === 2 && r.totalReferences >= 2,
        `files=${files.join(',')} refs=${r.totalReferences}`,
      );
      check(
        'cross-file rename content correct',
        [...r.changes.values()].every((c) => c.includes('calculate') && !/\bcompute\b/.test(c)),
        JSON.stringify([...r.changes.values()]),
      );
      check(
        'cross-file rename validations all ok',
        r.validations.every((v) => v.ok),
      );
    } finally {
      fs.rmSync(tmpAbs, { recursive: true, force: true });
    }
  }
}

async function partD(): Promise<void> {
  process.stdout.write('Part D — v3 import + property ops + sha guard\n');

  // add_named_import: create declaration
  {
    const r = await addNamedImport('a.ts', 'const x = 1;\n', './svc', 'AccountService');
    check(
      'add_import creates declaration',
      r.validation.ok && /import \{ AccountService \} from ['"]\.\/svc['"]/.test(r.newText),
      r.newText,
    );
  }
  // add_named_import: merge into existing + alias
  {
    const src = "import { A } from './m';\nconst x = 1;\n";
    const r = await addNamedImport('a.ts', src, './m', 'B', 'BB');
    check(
      'add_import merges + alias',
      r.validation.ok && /import \{ A, B as BB \} from/.test(r.newText),
      r.newText,
    );
  }
  // add_named_import: idempotent
  {
    const src = "import { A } from './m';\n";
    const r = await addNamedImport('a.ts', src, './m', 'A');
    check('add_import idempotent', r.newText === src, JSON.stringify(r.detail));
  }
  // remove_named_import: last specifier drops declaration
  {
    const src = "import { A } from './m';\nconst x = 1;\n";
    const r = await removeNamedImport('a.ts', src, './m', 'A');
    check(
      'remove_import drops declaration',
      r.validation.ok && !r.newText.includes('import {') && r.newText.includes('const x = 1;'),
      r.newText,
    );
  }
  // remove_named_import: one of several, no dangling comma
  {
    const src = "import { A, B, C } from './m';\n";
    const r = await removeNamedImport('a.ts', src, './m', 'B');
    check(
      'remove_import keeps siblings clean',
      r.validation.ok && /import \{ A, C \} from/.test(r.newText) && !r.newText.includes(',,'),
      r.newText,
    );
  }
  // replace_property_value (thesis example, scoped)
  {
    const src =
      "function build() {\n  const cfg = {\n    phone: '5511999999999',\n    on: true,\n  };\n  return cfg;\n}\n";
    const r = await replacePropertyValue('a.ts', src, 'phone', 'null', 'build');
    check(
      'replace_property_value scoped',
      r.validation.ok && r.newText.includes('phone: null') && r.newText.includes('on: true'),
      r.newText,
    );
  }
  // replace_property_value ambiguity refused
  {
    const src = 'const a = { k: 1 };\nconst b = { k: 2 };\n';
    let threw = false;
    try {
      await replacePropertyValue('a.ts', src, 'k', '9');
    } catch {
      threw = true;
    }
    check('replace_property_value refuses ambiguity', threw);
  }
  // semantic op rejects syntax-breaking value
  {
    const src = 'const o = { a: 1 };\n';
    const r = await replacePropertyValue('a.ts', src, 'a', '{{');
    check(
      'replace_property_value rejects broken value',
      r.validation.ok === false,
      JSON.stringify(r.validation),
    );
  }
}

// ── Part E — text-unit / Unicode safety (lever #2) ───────────────────────
function partE(): void {
  // grapheme segmentation: ZWJ family is ONE user-perceived character
  check('grapheme: ZWJ family = 1', graphemeLength('👨‍👩‍👧‍👦') === 1, String(graphemeLength('👨‍👩‍👧‍👦')));
  check('grapheme: astral emoji = 1', graphemeLength('😀') === 1, String(graphemeLength('😀')));
  check('grapheme: combining accent = 1', graphemeLength('é') === 1, String(graphemeLength('é')));

  // measure: emoji string is non-ascii and counts differ across units
  const mu = measure('a😀b');
  check(
    'measure: astral utf16>codepoints',
    mu.ascii === false && mu.utf16Units === 4 && mu.codepoints === 3 && mu.graphemes === 3,
    JSON.stringify(mu),
  );
  check('measure: ascii pure', measure('hello').ascii === true, JSON.stringify(measure('hello')));

  // characterDiff must NEVER split a surrogate pair: a whole emoji swap shows
  // the WHOLE old emoji in [- -] and WHOLE new emoji in {+ +}, no half-char
  const d = characterDiff("const a = '😀';", "const a = '🎉';", 'u.ts');
  check(
    'charDiff: whole emoji removed (no surrogate split)',
    d.includes('[-😀-]') && d.includes('{+🎉+}') && !d.includes('�'),
    JSON.stringify(d),
  );
  // accent edit stays grapheme-clean
  const d2 = characterDiff("const s = 'café';", "const s = 'cafe';", 'u.ts');
  check('charDiff: accent edit grapheme-clean', !d2.includes('�'), JSON.stringify(d2));

  // every grapheme round-trips (join === original) for a mixed string
  const mix = 'x=1; π≈3.14 😀👨‍👩‍👧‍👦 é';
  check('grapheme: lossless round-trip', graphemes(mix).join('') === mix, 'join mismatch');
}

// ── Part F — multi-language structural validation (lever #1) ─────────────
function partF(): void {
  // python: delete a ')' → structural regression refused
  {
    const r = applyEdits('m.py', 'def f(a, b):\n    return (a + b)\n', [
      { start: { line: 2, column: 18 }, end: { line: 2, column: 19 }, newText: '' },
    ]);
    check(
      'struct: py unbalanced paren refused',
      r.validation.language === 'structural' && r.validation.ok === false,
      JSON.stringify(r.validation),
    );
  }
  // python: balanced edit accepted
  {
    const r = applyEdits('m.py', 'x = (1 + 2)\n', [
      { start: { line: 1, column: 6 }, end: { line: 1, column: 7 }, newText: '9' },
    ]);
    check('struct: py balanced edit ok', r.validation.ok === true, JSON.stringify(r.validation));
  }
  // python '#' comment containing ')' must NOT false-trip
  {
    const r = applyEdits('m.py', 'x = 1  # note: ) bracket in comment\n', [
      { start: { line: 1, column: 5 }, end: { line: 1, column: 6 }, newText: '2' },
    ]);
    check(
      'struct: py comment bracket ignored',
      r.validation.ok === true,
      JSON.stringify(r.validation),
    );
  }
  // string containing '}' must NOT false-trip (go)
  {
    const r = applyEdits('m.go', 'package main\nvar s = "a } b"\n', [
      { start: { line: 2, column: 9 }, end: { line: 2, column: 16 }, newText: '"x } y"' },
    ]);
    check(
      'struct: go string brace ignored',
      r.validation.ok === true,
      JSON.stringify(r.validation),
    );
  }
  // go // line comment + balanced
  {
    const r = applyEdits('m.go', 'package main // ( unmatched in comment\nfunc f() {}\n', [
      { start: { line: 2, column: 11 }, end: { line: 2, column: 11 }, newText: ' return' },
    ]);
    check(
      'struct: go slash-comment ignored',
      r.validation.ok === true,
      JSON.stringify(r.validation),
    );
  }
  // introduce unterminated string → refused
  {
    const r = applyEdits('m.sh', 'echo "hello"\n', [
      { start: { line: 1, column: 12 }, end: { line: 1, column: 13 }, newText: '' },
    ]);
    check(
      'struct: sh unterminated string refused',
      r.validation.ok === false,
      JSON.stringify(r.validation),
    );
  }
  // pre-existing imbalance tolerated (no regression, surgical)
  {
    const r = applyEdits('m.py', 'x = (1\ny = 2\n', [
      { start: { line: 2, column: 5 }, end: { line: 2, column: 6 }, newText: '9' },
    ]);
    check(
      'struct: pre-existing imbalance tolerated',
      r.validation.ok === true,
      JSON.stringify(r.validation),
    );
  }
  // truly unknown ext stays generic no-op (no false positives on prose)
  {
    const r = applyEdits('notes.txt', 'a ) b ( c\n', [
      { start: { line: 1, column: 1 }, end: { line: 1, column: 2 }, newText: 'Z' },
    ]);
    check(
      'struct: unknown ext = generic',
      r.validation.language === 'generic',
      JSON.stringify(r.validation),
    );
  }
}

// ── Part G — auditability-without-code (thesis apex) ─────────────────────
function partG(): void {
  const fb = buildFounderBlock({
    file: 'backend/src/x.service.ts',
    operator: 'atomic_replace_literal',
    language: 'ts',
    syntaxBefore: 0,
    syntaxAfter: 0,
    changedChars: 4,
    expansionFactor: 1,
  });
  check(
    'founder: ts edit = structurally-validated',
    fb.promiseClass === 'structurally-validated',
    fb.promiseClass,
  );
  // honesty ceiling: a tool edit can NEVER claim behaviour proof → < 75
  check(
    'founder: zeroCodeTrust ceilinged < 75 (anti-fachada)',
    fb.zeroCodeTrust < 75 && fb.zeroCodeTrust > 0,
    String(fb.zeroCodeTrust),
  );
  check(
    'founder: notProven states behaviour unproven',
    /behaviou?r is NOT proven|NOT proven by this tool/i.test(fb.notProven),
    fb.notProven,
  );
  // structural-only language is honestly a weaker promise class
  const fbS = buildFounderBlock({
    file: 'main.py',
    operator: 'atomic_replace_range',
    language: 'structural',
    syntaxBefore: 0,
    syntaxAfter: 0,
    changedChars: 3,
    expansionFactor: 1,
  });
  check(
    'founder: structural lang = balance-validated',
    fbS.promiseClass === 'balance-validated' && fbS.zeroCodeTrust <= fb.zeroCodeTrust,
    JSON.stringify(fbS),
  );

  // founder block rides even at L0 (must never be trimmed away)
  const tr = buildTrace({
    file: 'a.ts',
    operator: 'atomic_replace_literal',
    before: 'const a=1;',
    newText: 'const a=2;',
    inlinePreview: 'const a=[-1-]{+2+};',
    validation: { language: 'ts', before: 0, after: 0 },
    metrics: { changedChars: 1, lineRewriteSurfaceChars: 1, expansionFactorAvoided: 1 },
  });
  const l0 = shapePayload(levelFor(false, 'L0'), { ok: true }, { inlinePreview: 'x', trace: tr });
  check(
    'founder: present at L0 (not trimmed)',
    typeof l0.founder === 'object' &&
      (l0.founder as { promiseClass?: string }).promiseClass === 'structurally-validated' &&
      l0.atomicDiff === undefined, // L0 still trims the diff, but NOT founder
    JSON.stringify(Object.keys(l0)),
  );
}

(async () => {
  await partA();
  await partB();
  await partC();
  await partD();
  partE();
  partF();
  partG();
  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  process.stderr.write(`SMOKE CRASH: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(2);
});
