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

import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
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
import { moveSymbolToFile, canExtractClassMethod } from './move.js';
import { createRequire } from 'node:module';
import * as tsmod from 'typescript';
import { graphemes, measure, graphemeLength } from './textunit.js';
import { buildFounderBlock } from './founder.js';
import { buildTrace, levelFor, shapePayload } from './trace.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_DIR = path.basename(__dirname) === 'dist' ? path.dirname(__dirname) : __dirname;

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

  const repoRoot = path.resolve(SOURCE_DIR, '..', '..', '..');
  const fixtureRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-fixture.${process.pid}.ts`);
  const fixtureAbs = path.join(repoRoot, fixtureRel);
  fs.writeFileSync(fixtureAbs, "export const TARGET = '5511999999999';\n");

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['--yes', 'tsx', path.join(SOURCE_DIR, 'server.ts')],
    cwd: repoRoot,
    stderr: 'inherit',
  });
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    check(
      'server lists all 31 tools (incl. symbol relocation + file decomposition + analyzer transaction + atomic_verify + product apex layer)',
      names.length === 31 &&
        names.includes('atomic_verify') &&
        names.includes('atomic_move_symbol_to_file') &&
        names.includes('atomic_decompose_file') &&
        names.includes('atomic_extract_symbol') &&
        names.includes('atomic_create_file') &&
        names.includes('atomic_replace_text') &&
        names.includes('atomic_transaction') &&
        names.includes('atomic_apply_eslint_dry_run_fixes') &&
        names.includes('atomic_wrap_range') &&
        names.includes('code_outline') &&
        names.includes('atomic_edit_symbol') &&
        names.includes('atomic_add_import') &&
        names.includes('atomic_remove_import') &&
        names.includes('atomic_replace_property_value') &&
        names.includes('product_intent_contract') &&
        names.includes('zero_code_trust_score') &&
        names.includes('behavior_receipt') &&
        names.includes('truth_receipt') &&
        names.includes('continuity_status') &&
        names.includes('atomic_lock_acquire') &&
        names.includes('atomic_lock_status') &&
        names.includes('atomic_lock_release'),
      names.join(','),
    );

    const intent = (await client.callTool({
      name: 'product_intent_contract',
      arguments: { goal: 'fazer o chat do admin persistir mensagens em Postgres' },
    })) as { content: { text: string }[] };
    const intentBody = JSON.parse(intent.content.at(-1)?.text ?? '{}');
    check(
      'product intent maps chat persistence',
      intentBody.ok === true && intentBody.targetIntegration === 'chat_persistence',
      intent.content[0]?.text ?? '',
    );

    const zct = (await client.callTool({
      name: 'zero_code_trust_score',
      arguments: {
        evidence: [{ kind: 'browser', status: 'passed', summary: 'user flow passed' }],
        founderCanValidateByProduct: true,
      },
    })) as { content: { text: string }[] };
    const zctBody = JSON.parse(zct.content.at(-1)?.text ?? '{}');
    check(
      'zero-code trust reaches 100 with product proof',
      zctBody.score === 100 && zctBody.verdict === 'PRODUCT_VALIDATABLE',
      zct.content[0]?.text ?? '',
    );

    const receipt = (await client.callTool({
      name: 'behavior_receipt',
      arguments: {
        productBehavior: 'Admin chat reloads persisted messages',
        validation: [{ kind: 'api', status: 'passed', summary: 'messages returned' }],
        clickPath: ['Admin', 'Chat', 'Reload session'],
      },
    })) as { content: { text: string }[] };
    const receiptBody = JSON.parse(receipt.content.at(-1)?.text ?? '{}');
    check(
      'behavior receipt produces founder proof',
      receiptBody.zeroCodeTrust === 100 && receiptBody.productProof === true,
      receipt.content[0]?.text ?? '',
    );

    const truth = (await client.callTool({
      name: 'truth_receipt',
      arguments: {
        claims: [
          { claim: 'API persisted message', evidenceKind: 'db', status: 'passed' },
          { claim: 'UI button is live', evidenceKind: 'stub', status: 'passed' },
        ],
      },
    })) as { content: { text: string }[] };
    const truthBody = JSON.parse(truth.content.at(-1)?.text ?? '{}');
    check(
      'truth receipt refuses stub as real',
      truthBody.claims?.[0]?.truth === 'REAL' && truthBody.claims?.[1]?.truth === 'STUB',
      truth.content[0]?.text ?? '',
    );

    const continuity = (await client.callTool({
      name: 'continuity_status',
      arguments: {},
    })) as { content: { text: string }[] };
    const continuityBody = JSON.parse(continuity.content.at(-1)?.text ?? '{}');
    check(
      'continuity status reads repo state',
      continuityBody.ok === true && typeof continuityBody.nextAction === 'string',
      continuity.content[0]?.text ?? '',
    );

    const lockId = `.smoke-lock-${process.pid}`;
    const acquired = (await client.callTool({
      name: 'atomic_lock_acquire',
      arguments: { frontId: lockId, owner: 'smoke', objective: 'prove mkdir lock' },
    })) as { content: { text: string }[] };
    const acquiredBody = JSON.parse(acquired.content.at(-1)?.text ?? '{}');
    check('atomic lock acquire works', acquiredBody.ok === true, acquired.content[0]?.text ?? '');
    const status = (await client.callTool({
      name: 'atomic_lock_status',
      arguments: {},
    })) as { content: { text: string }[] };
    const statusBody = JSON.parse(status.content.at(-1)?.text ?? '{}');
    check(
      'atomic lock status lists acquired lock',
      Array.isArray(statusBody.locks) &&
        statusBody.locks.some((lock: { frontId?: string }) => lock.frontId === lockId),
      status.content[0]?.text ?? '',
    );
    const released = (await client.callTool({
      name: 'atomic_lock_release',
      arguments: { frontId: lockId, owner: 'smoke', reason: 'smoke complete' },
    })) as { content: { text: string }[] };
    const releasedBody = JSON.parse(released.content.at(-1)?.text ?? '{}');
    check(
      'atomic lock release works',
      releasedBody.changed === true,
      released.content[0]?.text ?? '',
    );

    // live sha256 optimistic-concurrency guard
    const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
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
      JSON.parse(okSha.content.at(-1)?.text ?? '{}').ok === true,
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
    check('live code_outline omits fullText', !('fullText' in ob), out.content[0].text);
    check(
      'live code_outline reports target root',
      ob.target?.repoRoot === repoRoot && ob.target?.absPath === fixtureAbs,
      out.content[0].text,
    );

    const prev = (await client.callTool({
      name: 'atomic_insert_at',
      arguments: { file: fixtureRel, line: 1, column: 1, text: '// hdr\n', preview: true },
    })) as { content: { text: string }[] };
    const pb = JSON.parse(prev.content.at(-1)?.text ?? '{}');
    check(
      'preview dry-run does not write',
      pb.preview === true && pb.changed === false && typeof pb.diff === 'string',
      prev.content[0].text,
    );

    const res = (await client.callTool({
      name: 'atomic_replace_literal',
      arguments: { file: fixtureRel, currentText: "'5511999999999'", newText: 'null' },
    })) as { content: { text: string }[]; isError?: boolean };
    const body = JSON.parse(res.content.at(-1)?.text ?? '{}');
    check(
      'live literal swap returns human summary first',
      res.content.length >= 2 && /Atomic edit applied/.test(res.content[0]?.text ?? ''),
      res.content[0]?.text ?? '',
    );
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

    // absolute paths inside registered git worktrees must target that worktree,
    // not the coordinator's main repo root.
    const linkedParent = fs.mkdtempSync(path.join(os.tmpdir(), `atomic-edit-wt-${process.pid}-`));
    const linkedRoot = path.join(linkedParent, 'repo');
    const linkedRel = path.join(
      'scripts',
      'mcp',
      'atomic-edit',
      `.smoke-linked-worktree.${process.pid}.ts`,
    );
    const linkedAbs = path.join(linkedRoot, linkedRel);
    try {
      childProcess.execFileSync('git', ['worktree', 'add', '--detach', linkedRoot, 'HEAD'], {
        cwd: repoRoot,
        stdio: 'ignore',
      });
      fs.writeFileSync(linkedAbs, 'export const LINKED = 1;\n');
      const linked = (await client.callTool({
        name: 'atomic_replace_text',
        arguments: { file: linkedAbs, oldText: '1', newText: '2' },
      })) as { content: { text: string }[]; isError?: boolean };
      const linkedBody = JSON.parse(linked.content.at(-1)?.text ?? '{}');
      check(
        'absolute registered worktree path accepted',
        linkedBody.ok === true && linkedBody.changed === true,
        linked.content[0]?.text ?? '',
      );
      check(
        'absolute registered worktree path mutates linked worktree',
        fs.readFileSync(linkedAbs, 'utf8') === 'export const LINKED = 2;\n',
        fs.readFileSync(linkedAbs, 'utf8'),
      );
      check(
        'absolute registered worktree path does not create main-root side effect',
        !fs.existsSync(path.join(repoRoot, linkedRel)),
        linkedRel,
      );
    } finally {
      if (fs.existsSync(linkedAbs)) fs.unlinkSync(linkedAbs);
      try {
        childProcess.execFileSync('git', ['worktree', 'remove', linkedRoot], {
          cwd: repoRoot,
          stdio: 'ignore',
        });
      } catch {
        fs.rmSync(linkedRoot, { recursive: true, force: true });
      }
      fs.rmSync(linkedParent, { recursive: true, force: true });
    }

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
    const txb = JSON.parse(txOk.content.at(-1)?.text ?? '{}');
    check(
      'transaction returns human summary first',
      txOk.content.length >= 2 && /Atomic transaction applied/.test(txOk.content[0]?.text ?? ''),
      txOk.content[0]?.text ?? '',
    );
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

    // ── Lever #3 (extended): ONE big transaction = N creates + trim + imports ──
    const txDir = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-txbig.${process.pid}`);
    const txDirAbs = path.join(repoRoot, txDir);
    const originRel = path.join(txDir, 'origin.ts');
    const originAbs = path.join(repoRoot, originRel);
    fs.mkdirSync(txDirAbs, { recursive: true });
    fs.writeFileSync(originAbs, 'export const ORIG = 1; export const DROP = 2;\n');
    const createRels = [1, 2, 3, 4, 5].map((n) => path.join(txDir, 'mods', `m${n}.ts`));
    const bigPlan = [
      ...createRels.map((rel, i) => ({ file: rel, create: `export const M${i + 1} = ${i + 1};\n` })),
      {
        file: originRel,
        edits: [{ startLine: 1, startColumn: 23, endLine: 1, endColumn: 46, newText: '' }],
        addImports: [{ module: './mods/m1.js', name: 'M1' }],
      },
    ];
    const txBig = (await client.callTool({
      name: 'atomic_transaction',
      arguments: { plan: bigPlan },
    })) as { content: { text: string }[] };
    const txBigBody = JSON.parse(txBig.content.at(-1)?.text ?? '{}');
    const originAfter = fs.existsSync(originAbs) ? fs.readFileSync(originAbs, 'utf8') : '';
    check(
      'transaction: big batch (5 creates + nested mkdir + origin trim + import) = ONE atomic call',
      txBigBody.ok === true &&
        txBigBody.transaction === true &&
        txBigBody.filesWritten === 6 &&
        createRels.every(
          (rel, i) =>
            fs.existsSync(path.join(repoRoot, rel)) &&
            fs.readFileSync(path.join(repoRoot, rel), 'utf8') ===
              `export const M${i + 1} = ${i + 1};\n`,
        ) &&
        /import \{ M1 \}/.test(originAfter) &&
        originAfter.includes('export const ORIG = 1;') &&
        !originAfter.includes('DROP'),
      JSON.stringify({ filesWritten: txBigBody.filesWritten, originAfter }),
    );
    // all-or-nothing across creates: one syntactically broken create → NOTHING,
    // and the transaction-created files are deleted (no orphan stubs).
    const txBigBadRel = path.join(txDir, 'mods', 'never.ts');
    const txBigBad = (await client.callTool({
      name: 'atomic_transaction',
      arguments: {
        plan: [
          { file: path.join(txDir, 'mods', 'ok-extra.ts'), create: 'export const OK = 1;\n' },
          { file: txBigBadRel, create: 'export const = ;\n' },
        ],
      },
    })) as { content: { text: string }[]; isError?: boolean };
    check(
      'transaction: one broken create rolls back the whole batch (no orphan files)',
      txBigBad.isError === true &&
        /transaction REFUSED/.test(txBigBad.content[0].text) &&
        !fs.existsSync(path.join(repoRoot, txBigBadRel)) &&
        !fs.existsSync(path.join(repoRoot, txDir, 'mods', 'ok-extra.ts')),
      txBigBad.content[0].text,
    );
    fs.rmSync(txDirAbs, { recursive: true, force: true });

    // analyzer transaction: ESLint proposes fixes in dry-run mode, atomic-edit writes them.
    const eslintRel = path.join('worker', `.smoke-eslint.${process.pid}.ts`);
    const eslintAbs = path.join(repoRoot, eslintRel);
    fs.writeFileSync(
      eslintAbs,
      'const envBackup = { TEST_FLAG: process.env.TEST_FLAG }\nexport function smoke(flag:boolean){if(flag){return 1}return 0}\n',
    );
    try {
      const eslintTx = (await client.callTool({
        name: 'atomic_apply_eslint_dry_run_fixes',
        arguments: {
          cwd: repoRoot,
          args: [eslintRel, '--fix-dry-run', '--format', 'json'],
          allowedPaths: [path.join(repoRoot, 'worker')],
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const eslintBody = JSON.parse(eslintTx.content.at(-1)?.text ?? '{}') as {
        ok?: boolean;
        filesWritten?: number;
        traceRefs?: string[];
        filesTotal?: number;
        filesOmitted?: number;
        recommendedVerification?: string[];
        residueActionCandidates?: { symbol?: string; preferredAtomicAction?: string }[];
        residueActionCandidatesTotal?: number;
        summary?: string;
      };
      const eslintAfter = fs.readFileSync(eslintAbs, 'utf8');
      check(
        'eslint dry-run fixes accept absolute cwd and allowedPaths',
        eslintBody.ok === true &&
          eslintBody.filesWritten === 1 &&
          eslintAfter.includes('if (flag) {') &&
          eslintAfter.includes('return 1;'),
        eslintTx.content[0]?.text ?? '',
      );
      check(
        'eslint analyzer recommends complete package proof',
        eslintBody.recommendedVerification?.includes('npm --prefix worker run build') === true &&
          eslintBody.summary?.includes('npm --prefix worker run build') === true,
        JSON.stringify(eslintBody),
      );
      check(
        'eslint analyzer reports compact file totals',
        eslintBody.filesTotal === 1 && eslintBody.filesOmitted === 0,
        JSON.stringify(eslintBody),
      );
      check(
        'eslint analyzer reports residue action candidates',
        eslintBody.residueActionCandidatesTotal === 1 &&
          eslintBody.residueActionCandidates?.[0]?.symbol === 'envBackup' &&
          eslintBody.residueActionCandidates[0].preferredAtomicAction ===
            'use_existing_fixture_or_env_backup_with_atomic_replace_text',
        JSON.stringify(eslintBody),
      );
      const firstTrace = eslintBody.traceRefs?.[0];
      const traceAbs = firstTrace ? path.join(repoRoot, firstTrace) : '';
      const traceBody =
        traceAbs && fs.existsSync(traceAbs) ? JSON.parse(fs.readFileSync(traceAbs, 'utf8')) : {};
      check(
        'eslint analyzer trace records preservation topology',
        traceBody.targetUnit === 'eslint_dry_run_file_output' &&
          traceBody.semanticImpact === 'behavior_preserving_lint_cleanup' &&
          Array.isArray(traceBody.preservedZones) &&
          traceBody.preservedZones.length >= 2,
        JSON.stringify(traceBody),
      );

      const residueRel = path.join('worker', `.smoke-eslint-residue.${process.pid}.spec.ts`);
      const residueAbs = path.join(repoRoot, residueRel);
      fs.writeFileSync(
        residueAbs,
        [
          "import { describe, beforeEach, it, expect } from 'vitest';",
          '',
          'const envBackup = { ...process.env };',
          '',
          'function clearOpenAiEnvs() {',
          '  delete process.env.OPENAI_MODEL;',
          '}',
          '',
          "describe('openai-models', () => {",
          '  beforeEach(() => {',
          '    clearOpenAiEnvs();',
          '  });',
          '',
          "  describe('resolveWorkerOpenAIModel', () => {",
          "    it('uses env', () => {",
          "      process.env.OPENAI_MODEL = 'gpt-test';",
          "      expect(process.env.OPENAI_MODEL).toBe('gpt-test');",
          '    });',
          '  });',
          '});',
          '',
        ].join('\n'),
      );
      try {
        const residueTx = (await client.callTool({
          name: 'atomic_apply_eslint_dry_run_fixes',
          arguments: {
            cwd: repoRoot,
            args: [residueRel, '--fix-dry-run', '--format', 'json'],
            allowedPaths: [path.join(repoRoot, 'worker')],
          },
        })) as { content: { text: string }[]; isError?: boolean };
        const residueBody = JSON.parse(residueTx.content.at(-1)?.text ?? '{}') as {
          ok?: boolean;
          knownResidueFixesAppliedTotal?: number;
        };
        const residueAfter = fs.readFileSync(residueAbs, 'utf8');
        check(
          'eslint analyzer applies known env residue fix',
          residueBody.ok === true &&
            residueBody.knownResidueFixesAppliedTotal === 1 &&
            residueAfter.includes('afterEach') &&
            residueAfter.includes('Object.entries(envBackup).forEach') &&
            !residueAfter.includes('value === undefined'),
          residueTx.content[0]?.text ?? '',
        );
      } finally {
        if (fs.existsSync(residueAbs)) fs.unlinkSync(residueAbs);
      }
    } finally {
      if (fs.existsSync(eslintAbs)) fs.unlinkSync(eslintAbs);
    }

    // ── TOOLDEV21: highest-faithful cross-file rename BY SELECTOR ──────────
    // The rename operator must accept the natural intention ("rename THIS
    // class method everywhere") and resolve the position itself, instead of
    // forcing the caller down to blunt text rewrites.
    {
      const selDirRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-sel.${process.pid}`,
      );
      const selDirAbs = path.join(repoRoot, selDirRel);
      fs.mkdirSync(selDirAbs, { recursive: true });
      const W = (name: string, body: string): string => {
        const abs = path.join(selDirAbs, name);
        fs.writeFileSync(abs, body);
        return abs;
      };
      const R = (name: string): string =>
        fs.readFileSync(path.join(selDirAbs, name), 'utf8');
      const callRename = async (args: Record<string, unknown>) => {
        const res = (await client.callTool({
          name: 'atomic_rename_symbol_cross_file',
          arguments: args,
        })) as { content: { text: string }[]; isError?: boolean };
        const body = JSON.parse(res.content.at(-1)?.text ?? '{}') as Record<
          string,
          unknown
        >;
        return { res, body };
      };
      try {
        fs.writeFileSync(
          path.join(selDirAbs, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              strict: false,
              noEmit: true,
              experimentalDecorators: true,
            },
            include: ['*.ts'],
          }),
        );
        // ── (ii)+(jj) fixture: Svc.overview + a route string literal +
        //     a DIFFERENT class Other.overview that must stay untouched.
        const svcAbs = W(
          'svc.ts',
          [
            'function Get(route: string): MethodDecorator {',
            '  return () => { void route; };',
            '}',
            'export class Svc {',
            "  @Get('overview')",
            '  overview(id: string): string {',
            '    return `svc:${id}`;',
            '  }',
            '}',
            'export class Other {',
            '  overview(): string {',
            "    return 'other-overview';",
            '  }',
            '}',
            '',
          ].join('\n'),
        );
        W(
          'b.ts',
          [
            "import { Svc } from './svc';",
            'export function callB(): string {',
            '  const s = new Svc();',
            "  return s.overview('b');",
            '}',
            '',
          ].join('\n'),
        );
        W(
          'c.ts',
          [
            "import { Svc, Other } from './svc';",
            'export function callC(): string {',
            '  const s = new Svc();',
            '  const o = new Other();',
            "  return s.overview('c') + o.overview();",
            '}',
            '',
          ].join('\n'),
        );
        W(
          'svc.spec.ts',
          [
            "import { Svc } from './svc';",
            'const svc = new Svc();',
            "export const t = svc.overview('spec');",
            '',
          ].join('\n'),
        );

        const { body: selBody } = await callRename({
          file: svcAbs,
          selector: 'Svc.overview',
          newName: 'complianceOverview',
        });
        const selFiles = (selBody.files as string[] | undefined) ?? [];
        const baseNames = selFiles.map((f) => path.basename(f)).sort();
        check(
          '(ii) selector rename: ONE call, all-or-nothing, touches def + B + C + spec',
          selBody.ok === true &&
            selBody.changed === true &&
            baseNames.length === 4 &&
            baseNames.join(',') === 'b.ts,c.ts,svc.spec.ts,svc.ts' &&
            typeof selBody.selectorNote === 'string' &&
            (selBody.selectorNote as string).includes('Svc.overview'),
          JSON.stringify({ files: baseNames, note: selBody.selectorNote }),
        );
        const svcAfter = R('svc.ts');
        const bAfter = R('b.ts');
        const cAfter = R('c.ts');
        const specAfter = R('svc.spec.ts');
        check(
          '(ii) definition + every true ref became complianceOverview',
          /\bcomplianceOverview\(id: string\)/.test(svcAfter) &&
            /s\.complianceOverview\('b'\)/.test(bAfter) &&
            /s\.complianceOverview\('c'\)/.test(cAfter) &&
            /svc\.complianceOverview\('spec'\)/.test(specAfter),
          JSON.stringify({ svcAfter, bAfter, cAfter, specAfter }),
        );
        check(
          '(jj) precision: route string literal @Get(\'overview\') BYTE-unchanged',
          svcAfter.includes("@Get('overview')") &&
            !svcAfter.includes("@Get('complianceOverview')"),
          svcAfter,
        );
        check(
          '(jj) precision: DIFFERENT class Other.overview + o.overview() UNTOUCHED',
          /class Other\s*\{[\s\S]*\boverview\(\): string/.test(svcAfter) &&
            svcAfter.includes("return 'other-overview'") &&
            /o\.overview\(\)/.test(cAfter) &&
            !/o\.complianceOverview\(\)/.test(cAfter),
          JSON.stringify({ svcAfter, cAfter }),
        );
        // every touched fixture file must still parse
        const reparse = (src: string): boolean => {
          const ts = tsmod;
          const sf = ts.createSourceFile(
            'x.ts',
            src,
            ts.ScriptTarget.Latest,
            true,
          );
          return (
            (sf as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics
              .length === 0
          );
        };
        check(
          '(ii) all touched files still parse',
          [svcAfter, bAfter, cAfter, specAfter].every(reparse),
          'parse failure after selector rename',
        );

        // ── (kk) unscoped selector: a top-level function across 2 files ──
        const h1Abs = W(
          'h1.ts',
          'export function helper(n: number): number { return n + 1; }\n',
        );
        W(
          'h2.ts',
          "import { helper } from './h1';\nexport const hv = helper(2);\n",
        );
        const { body: hBody } = await callRename({
          file: h1Abs,
          selector: 'helper',
          newName: 'helper2',
        });
        const hFiles = ((hBody.files as string[] | undefined) ?? [])
          .map((f) => path.basename(f))
          .sort();
        check(
          '(kk) unscoped selector renames top-level fn across 2 files in ONE call',
          hBody.ok === true &&
            hBody.changed === true &&
            hFiles.join(',') === 'h1.ts,h2.ts' &&
            /export function helper2\(/.test(R('h1.ts')) &&
            /helper2\(2\)/.test(R('h2.ts')) &&
            !/\bhelper\b(?!2)/.test(R('h1.ts')),
          JSON.stringify({ files: hFiles, h1: R('h1.ts'), h2: R('h2.ts') }),
        );

        // ── (ll) errors/back-compat ──────────────────────────────────────
        const { res: neitherRes, body: neitherBody } = await callRename({
          file: svcAbs,
          newName: 'whatever',
        });
        const neitherMsg = JSON.stringify(neitherBody);
        check(
          '(ll) neither selector nor line → precise dual-mode error',
          neitherRes.isError === true &&
            /selector/.test(neitherMsg) &&
            /line/.test(neitherMsg) &&
            /[Nn]either/.test(neitherMsg),
          neitherMsg,
        );

        // dedicated, untouched fixture so ambiguity is independent of the
        // earlier Svc.overview rename (which would otherwise leave only one
        // `overview` and make the selector unambiguous).
        const ambAbs = W(
          'amb.ts',
          [
            'export class AmbA {',
            '  overview(): string { return "a"; }',
            '}',
            'export class AmbB {',
            '  overview(): string { return "b"; }',
            '}',
            '',
          ].join('\n'),
        );
        const { res: ambRes, body: ambBody } = await callRename({
          file: ambAbs,
          selector: 'overview',
          newName: 'x2',
        });
        const ambMsg = JSON.stringify(ambBody);
        check(
          '(ll) ambiguous selector surfaces resolveSymbol candidate list (not a dead end)',
          ambRes.isError === true &&
            /ambiguous selector/.test(ambMsg) &&
            /AmbA\.overview/.test(ambMsg) &&
            /AmbB\.overview/.test(ambMsg) &&
            /more specific scoped selector/.test(ambMsg),
          ambMsg,
        );

        // positional (line-based) rename still works EXACTLY as before
        W(
          'pa.ts',
          'export function compute(seed: number) { return seed + 1; }\n',
        );
        W(
          'pb.ts',
          'import { compute } from "./pa";\nexport const pr = compute(41);\n',
        );
        const { body: posBody } = await callRename({
          file: path.join(selDirAbs, 'pa.ts'),
          line: 1,
          column: 17,
          newName: 'calculate',
        });
        const posFiles = ((posBody.files as string[] | undefined) ?? [])
          .map((f) => path.basename(f))
          .sort();
        check(
          '(ll) positional back-compat: line/column rename unchanged (no selectorNote)',
          posBody.ok === true &&
            posBody.changed === true &&
            posFiles.join(',') === 'pa.ts,pb.ts' &&
            posBody.selectorNote === undefined &&
            /export function calculate\(/.test(R('pa.ts')) &&
            /calculate\(41\)/.test(R('pb.ts')),
          JSON.stringify({ files: posFiles, note: posBody.selectorNote }),
        );
      } finally {
        fs.rmSync(selDirAbs, { recursive: true, force: true });
      }
    }

    // ── TOOLDEV22: cross-file rename reference coverage is COMPLETE even
    // when the nearest tsconfig EXCLUDES *.spec.ts / *.test.ts. Test call
    // sites (incl. NestJS-style DI vars typed via module.get(Class)) are
    // TRUE references — ONE selector call must rename them too, while a
    // DIFFERENT class's same-named member, a string literal, and unrelated
    // locals stay byte-unchanged. residualUnresolved must be empty.
    {
      const t22Rel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-t22.${process.pid}`,
      );
      const t22Abs = path.join(repoRoot, t22Rel);
      fs.mkdirSync(t22Abs, { recursive: true });
      const W = (name: string, body: string): string => {
        const abs = path.join(t22Abs, name);
        fs.writeFileSync(abs, body);
        return abs;
      };
      const R = (name: string): string =>
        fs.readFileSync(path.join(t22Abs, name), 'utf8');
      const callRename = async (args: Record<string, unknown>) => {
        const res = (await client.callTool({
          name: 'atomic_rename_symbol_cross_file',
          arguments: args,
        })) as { content: { text: string }[]; isError?: boolean };
        const body = JSON.parse(res.content.at(-1)?.text ?? '{}') as Record<
          string,
          unknown
        >;
        return { res, body };
      };
      const reparse = (src: string): boolean => {
        const sf = tsmod.createSourceFile(
          'x.ts',
          src,
          tsmod.ScriptTarget.Latest,
          true,
        );
        return (
          (sf as unknown as { parseDiagnostics: unknown[] }).parseDiagnostics
            .length === 0
        );
      };
      try {
        // tsconfig that EXCLUDES specs/tests — reproduces the real backend
        // build-config shape that made R35 miss the .spec.ts call sites.
        fs.writeFileSync(
          path.join(t22Abs, 'tsconfig.json'),
          JSON.stringify({
            compilerOptions: {
              strict: false,
              noEmit: true,
              experimentalDecorators: true,
            },
            include: ['**/*.ts'],
            exclude: ['**/*.spec.ts', '**/*.test.ts'],
          }),
        );
        const svcAbs = W(
          'svc.ts',
          [
            'function Get(route: string): MethodDecorator {',
            '  return () => { void route; };',
            '}',
            'export class Svc {',
            "  @Get('m')",
            '  m(id: string): string {',
            '    return `svc:${id}`;',
            '  }',
            '}',
            'export class Other {',
            '  m(): string {',
            "    return 'other-m';",
            '  }',
            '}',
            'export function makeSvc(): Svc {',
            '  return new Svc();',
            '}',
            'export function moduleGet<T>(C: new () => T): T {',
            '  return new C();',
            '}',
            '',
          ].join('\n'),
        );
        W(
          'b.ts',
          [
            "import { Svc } from './svc';",
            'export function callB(): string {',
            '  const s = new Svc();',
            "  return s.m('b');",
            '}',
            '',
          ].join('\n'),
        );
        // (mm) sibling *.spec.ts: const s = makeSvc(); s.m()  (s typed Svc)
        W(
          'x.spec.ts',
          [
            "import { makeSvc } from './svc';",
            'const s = makeSvc();',
            "export const t = s.m('spec');",
            '',
          ].join('\n'),
        );
        // (nn) NestJS-style DI in a *.spec.ts: const s = moduleGet(Svc); s.m()
        W(
          'di.spec.ts',
          [
            "import { Svc, moduleGet } from './svc';",
            'const s = moduleGet(Svc);',
            "export const d = s.m('di');",
            '',
          ].join('\n'),
        );
        // (oo) precision under the widened scope: a string literal 'm', a
        // DIFFERENT class Other2 with other.m(), and a same-named local.
        const unrelatedSrc = [
          'class Other2 {',
          '  m(): string {',
          "    return 'o2';",
          '  }',
          '}',
          'const o = new Other2();',
          "export const lit = 'm';",
          'export const oc = o.m();',
          'export const localM = (() => {',
          '  const m = 41;',
          '  return m;',
          '})();',
          '',
        ].join('\n');
        W('unrelated.spec.ts', unrelatedSrc);

        const beforeSvc = R('svc.ts');
        const { body: t22 } = await callRename({
          file: svcAbs,
          selector: 'Svc.m',
          newName: 'm2',
        });
        const t22Files = ((t22.files as string[] | undefined) ?? [])
          .map((f) => path.basename(f))
          .sort();
        const residual = (t22.residualUnresolved as unknown[] | undefined) ?? [];
        const svcAfter = R('svc.ts');
        const bAfter = R('b.ts');
        const xAfter = R('x.spec.ts');
        const diAfter = R('di.spec.ts');

        check(
          '(mm) ONE selector call renames def + module B + sibling x.spec.ts (tsconfig EXCLUDES specs)',
          t22.ok === true &&
            t22.changed === true &&
            t22Files.join(',') === 'b.ts,di.spec.ts,svc.ts,x.spec.ts' &&
            /\bm2\(id: string\)/.test(svcAfter) &&
            /s\.m2\('b'\)/.test(bAfter) &&
            /s\.m2\('spec'\)/.test(xAfter),
          JSON.stringify({ files: t22Files, svcAfter, bAfter, xAfter }),
        );
        check(
          '(mm) residualUnresolved is EMPTY ⇒ one call sufficed, no replace_text tail',
          Array.isArray(residual) && residual.length === 0,
          JSON.stringify(residual),
        );
        check(
          '(mm) every touched file still parses',
          [svcAfter, bAfter, xAfter, diAfter].every(reparse),
          'parse failure after widened cross-file rename',
        );
        check(
          '(nn) NestJS-style DI spec call (moduleGet(Svc) → s.m()) IS renamed by the one selector call',
          /const s = moduleGet\(Svc\);/.test(diAfter) &&
            /s\.m2\('di'\)/.test(diAfter) &&
            !/s\.m\('di'\)/.test(diAfter),
          diAfter,
        );
        check(
          "(oo) precision: route string literal @Get('m') BYTE-unchanged",
          svcAfter.includes("@Get('m')") &&
            !svcAfter.includes("@Get('m2')"),
          svcAfter,
        );
        check(
          '(oo) precision: DIFFERENT class Other.m in the SAME file UNTOUCHED',
          /class Other\s*\{\s*m\(\): string/.test(svcAfter) &&
            svcAfter.includes("return 'other-m'"),
          svcAfter,
        );
        check(
          '(oo) precision: unrelated.spec.ts (string literal + Other2.m + same-named local) BYTE-identical',
          R('unrelated.spec.ts') === unrelatedSrc,
          R('unrelated.spec.ts'),
        );
        check(
          '(oo) widening did NOT corrupt the def file outside the renamed method',
          beforeSvc.replace(/\bm\(/g, 'm2(') === svcAfter ||
            (svcAfter.includes('export function makeSvc(): Svc') &&
              svcAfter.includes('export function moduleGet<T>(C: new () => T): T')),
          svcAfter,
        );
        check(
          '(pp) result reports renamedRefs (number ≥ 4: def + B + 2 specs) and residualUnresolved (array)',
          typeof t22.renamedRefs === 'number' &&
            (t22.renamedRefs as number) >= 4 &&
            Array.isArray(t22.residualUnresolved),
          JSON.stringify({
            renamedRefs: t22.renamedRefs,
            residualUnresolved: t22.residualUnresolved,
          }),
        );

        // (pp) back-compat: positional (line-based) rename still works AND
        // also reports the new fields — tooldev21 selector path unchanged.
        W(
          'pa.ts',
          'export function compute(seed: number) { return seed + 1; }\n',
        );
        W(
          'pb.ts',
          'import { compute } from "./pa";\nexport const pr = compute(41);\n',
        );
        const { body: posBody } = await callRename({
          file: path.join(t22Abs, 'pa.ts'),
          line: 1,
          column: 17,
          newName: 'calculate',
        });
        const posFiles = ((posBody.files as string[] | undefined) ?? [])
          .map((f) => path.basename(f))
          .sort();
        check(
          '(pp) positional back-compat unchanged + emits renamedRefs/residualUnresolved',
          posBody.ok === true &&
            posBody.changed === true &&
            posFiles.join(',') === 'pa.ts,pb.ts' &&
            posBody.selectorNote === undefined &&
            typeof posBody.renamedRefs === 'number' &&
            Array.isArray(posBody.residualUnresolved) &&
            (posBody.residualUnresolved as unknown[]).length === 0 &&
            /export function calculate\(/.test(R('pa.ts')) &&
            /calculate\(41\)/.test(R('pb.ts')),
          JSON.stringify({
            files: posFiles,
            renamedRefs: posBody.renamedRefs,
            residual: posBody.residualUnresolved,
          }),
        );
      } finally {
        fs.rmSync(t22Abs, { recursive: true, force: true });
      }
    }

    // ── TOOLDEV23: forgiving input aliases on the high-frequency read/edit
    // tools. Previously-rejected synonym arg names (path/find/replace/…) now
    // resolve to the SAME behaviour as the canonical key; canonical calls stay
    // byte-identical; conflicting both-present keeps canonical + notes it.
    {
      const t23Rel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-t23.${process.pid}`,
      );
      const t23Abs = path.join(repoRoot, t23Rel);
      fs.mkdirSync(t23Abs, { recursive: true });
      const callBody = async (name: string, args: Record<string, unknown>) => {
        const res = (await client.callTool({ name, arguments: args })) as {
          content: { text: string }[];
          isError?: boolean;
        };
        return {
          res,
          body: JSON.parse(res.content.at(-1)?.text ?? '{}') as Record<
            string,
            unknown
          >,
        };
      };
      try {
        const srcAbs = path.join(t23Abs, 'al.ts');
        fs.writeFileSync(
          srcAbs,
          [
            'export function alpha(n: number): number {',
            '  return n + 1;',
            '}',
            'export const beta = 2;',
            '',
          ].join('\n'),
        );

        // (qq) code_outline {path} === {file} (deep-equal symbol list)
        const olFile = await callBody('code_outline', { file: srcAbs });
        const olPath = await callBody('code_outline', { path: srcAbs });
        check(
          '(qq) code_outline {path} returns byte-identical body to {file}',
          olFile.res.isError !== true &&
            olPath.res.isError !== true &&
            JSON.stringify(olFile.body) === JSON.stringify(olPath.body) &&
            Array.isArray(olFile.body.symbols) &&
            (olFile.body.symbols as unknown[]).length === 2 &&
            olFile.body._aliasNote === undefined &&
            olPath.body._aliasNote === undefined,
          JSON.stringify({ f: olFile.body, p: olPath.body }),
        );

        // (qq) code_read_symbol {path,selector} === {file,selector}
        const rsFile = await callBody('code_read_symbol', {
          file: srcAbs,
          selector: 'alpha',
        });
        const rsPath = await callBody('code_read_symbol', {
          path: srcAbs,
          selector: 'alpha',
        });
        check(
          '(qq) code_read_symbol {path,selector} byte-identical to {file,selector}',
          rsFile.res.isError !== true &&
            rsPath.res.isError !== true &&
            JSON.stringify(rsFile.body) === JSON.stringify(rsPath.body) &&
            typeof rsFile.body.code === 'string',
          JSON.stringify({ f: rsFile.body, p: rsPath.body }),
        );

        // (qq) code_browse {path} === {dir}
        const brDir = await callBody('code_browse', { dir: t23Rel });
        const brPath = await callBody('code_browse', { path: t23Rel });
        check(
          '(qq) code_browse {path} byte-identical to {dir}',
          brDir.res.isError !== true &&
            brPath.res.isError !== true &&
            JSON.stringify(brDir.body) === JSON.stringify(brPath.body),
          JSON.stringify({ d: brDir.body, p: brPath.body }),
        );

        // (rr) atomic_replace_text {find,replace} performs the SAME edit as
        // {oldText,newText} — identical resulting text + same body/trace shape.
        const aAbs = path.join(t23Abs, 'ra.ts');
        const bAbs = path.join(t23Abs, 'rb.ts');
        const seed = 'export const VALUE = 1;\n';
        fs.writeFileSync(aAbs, seed);
        fs.writeFileSync(bAbs, seed);
        const repCanon = await callBody('atomic_replace_text', {
          file: aAbs,
          oldText: 'VALUE = 1',
          newText: 'VALUE = 2',
        });
        const repAlias = await callBody('atomic_replace_text', {
          file: bAbs,
          find: 'VALUE = 1',
          replace: 'VALUE = 2',
        });
        const aAfter = fs.readFileSync(aAbs, 'utf8');
        const bAfter = fs.readFileSync(bAbs, 'utf8');
        check(
          '(rr) atomic_replace_text {find,replace} === {oldText,newText} (same text + shape)',
          repCanon.body.ok === true &&
            repAlias.body.ok === true &&
            repCanon.body.changed === true &&
            repAlias.body.changed === true &&
            aAfter === 'export const VALUE = 2;\n' &&
            bAfter === aAfter &&
            JSON.stringify(repCanon.body.validation) ===
              JSON.stringify(repAlias.body.validation) &&
            typeof repCanon.body.tracePath === 'string' &&
            typeof repAlias.body.tracePath === 'string' &&
            repCanon.body._aliasNote === undefined &&
            repAlias.body._aliasNote === undefined,
          JSON.stringify({ a: repCanon.body, b: repAlias.body }),
        );

        // (ss) precedence: BOTH file + conflicting path → canonical file wins,
        // _aliasNote present; canonical-only call unchanged (no note).
        const conflict = await callBody('code_outline', {
          file: srcAbs,
          path: path.join(t23Abs, 'does-not-exist.ts'),
        });
        const canonOnly = await callBody('code_outline', { file: srcAbs });
        check(
          '(ss) conflicting {file,path}: canonical file wins + _aliasNote present',
          conflict.res.isError !== true &&
            Array.isArray(conflict.body.symbols) &&
            (conflict.body.symbols as unknown[]).length === 2 &&
            typeof conflict.body._aliasNote === 'string' &&
            (conflict.body._aliasNote as string).includes('path') &&
            canonOnly.body._aliasNote === undefined &&
            JSON.stringify(canonOnly.body) === JSON.stringify(olFile.body),
          JSON.stringify(conflict.body),
        );

        // (tt) regression: tooldev21 selector cross-file rename still works
        // unchanged with the alias layer present (additive, no drift).
        fs.writeFileSync(
          path.join(t23Abs, 'rd.ts'),
          'export function compute(seed: number) { return seed + 1; }\n',
        );
        fs.writeFileSync(
          path.join(t23Abs, 're.ts'),
          'import { compute } from "./rd";\nexport const rr = compute(41);\n',
        );
        const ren = await callBody('atomic_rename_symbol_cross_file', {
          file: path.join(t23Abs, 'rd.ts'),
          selector: 'compute',
          newName: 'calculate',
        });
        check(
          '(tt) tooldev21 selector cross-file rename unchanged under alias layer',
          ren.body.ok === true &&
            ren.body.changed === true &&
            /export function calculate\(/.test(
              fs.readFileSync(path.join(t23Abs, 'rd.ts'), 'utf8'),
            ) &&
            /calculate\(41\)/.test(
              fs.readFileSync(path.join(t23Abs, 're.ts'), 'utf8'),
            ),
          JSON.stringify(ren.body),
        );
      } finally {
        fs.rmSync(t23Abs, { recursive: true, force: true });
      }
    }

    // ── TOOLDEV24: atomic_edit_symbol op=replace is now MINIMAL-DIFF
    // PRESERVING (Preservação Máxima com Mutação Mínima — §6.1/§6.2). A
    // localized change inside a symbol splices ONLY the differing inner span;
    // the unchanged head/tail stay byte-identical in source position. Same
    // final symbol text as the old full-span replace — only the diff surface
    // (git/trace/churn) shrinks. Degenerate full rewrites still work as before.
    {
      const t24Rel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-t24.${process.pid}`);
      const t24Abs = path.join(repoRoot, t24Rel);
      fs.mkdirSync(t24Abs, { recursive: true });
      const callT24 = async (name: string, args: Record<string, unknown>) => {
        const res = (await client.callTool({ name, arguments: args })) as {
          content: { text: string }[];
          isError?: boolean;
        };
        return {
          res,
          body: JSON.parse(res.content.at(-1)?.text ?? '{}') as Record<string, unknown>,
        };
      };
      // Trim common head/tail LINES; what remains is the genuine line delta.
      const changedLineCount = (oldT: string, newT: string): number => {
        const a = oldT.split('\n');
        const b = newT.split('\n');
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) i++;
        let j = 0;
        while (j < a.length - i && j < b.length - i && a[a.length - 1 - j] === b[b.length - 1 - j]) {
          j++;
        }
        return Math.max(a.length - i - j, b.length - i - j);
      };
      type Span = { start: number; end: number; oldLen: number; newLen: number };
      try {
        // (uu) ~22-line function; add ONE statement near the end. The applied
        // edit must be the inserted line ONLY — head & tail byte-identical.
        const uuAbs = path.join(t24Abs, 'uu.ts');
        const uuSrc = [
          'export function summarize(values: number[]): { total: number; count: number } {',
          '  let total = 0;',
          '  let count = 0;',
          '  for (const v of values) {',
          '    if (v < 0) {',
          '      continue;',
          '    }',
          '    total += v;',
          '    count += 1;',
          '  }',
          '  const report = {',
          '    total: total,',
          '    count: count,',
          '  };',
          '  if (count === 0) {',
          '    return { total: 0, count: 0 };',
          '  }',
          '  return report;',
          '}',
          '',
        ].join('\n');
        fs.writeFileSync(uuAbs, uuSrc);
        const uuRead = await callT24('code_read_symbol', { file: uuAbs, selector: 'summarize' });
        const uuBody = String(uuRead.body.code ?? '');
        const uuNew = uuBody.replace(
          '  return report;\n}',
          '  report.total = Math.max(report.total, 0);\n  return report;\n}',
        );
        const uuFileBefore = fs.readFileSync(uuAbs, 'utf8');
        const uuEdit = await callT24('atomic_edit_symbol', {
          file: uuAbs,
          selector: 'summarize',
          op: 'replace',
          code: uuNew,
        });
        const uuFileAfter = fs.readFileSync(uuAbs, 'utf8');
        const uuCs = uuEdit.body.changedSpan as Span | undefined;
        const uuSymLen = Number(uuEdit.body.symbolLength ?? 0);
        const uuTailLen = uuCs ? uuFileBefore.length - uuCs.end : -1;
        check(
          '(uu) localized add: minimal applied span, head/tail byte-identical, ≈1 line diff',
          uuEdit.body.ok === true &&
            uuEdit.body.changed === true &&
            uuNew !== uuBody &&
            /report\.total = Math\.max\(report\.total, 0\);/.test(uuFileAfter) &&
            uuFileAfter.replace('  report.total = Math.max(report.total, 0);\n', '') ===
              uuFileBefore &&
            uuCs !== undefined &&
            uuSymLen > 300 &&
            uuCs.newLen * 3 < uuSymLen &&
            uuCs.oldLen * 4 < uuSymLen &&
            Number(uuEdit.body.intentionChars ?? uuSymLen) * 3 < uuSymLen &&
            // byte-identical anchors in ORIGINAL source position
            uuFileBefore.slice(0, uuCs.start) === uuFileAfter.slice(0, uuCs.start) &&
            uuTailLen >= 0 &&
            uuFileBefore.slice(uuCs.end) ===
              uuFileAfter.slice(uuFileAfter.length - uuTailLen) &&
            changedLineCount(uuFileBefore, uuFileAfter) <= 2,
          JSON.stringify({ cs: uuCs, symLen: uuSymLen, body: uuEdit.body }),
        );

        // (vv) signature + inner change in ONE edit_symbol (two separated
        // changes): one minimal CONTIGUOUS span covers both, head before the
        // first change and tail after the last change preserved, and the
        // resulting symbol text equals exactly the intended new body.
        const vvAbs = path.join(t24Abs, 'vv.ts');
        fs.writeFileSync(vvAbs, uuSrc);
        const vvRead = await callT24('code_read_symbol', { file: vvAbs, selector: 'summarize' });
        const vvBody = String(vvRead.body.code ?? '');
        const vvNew = vvBody
          .replace('summarize(values: number[])', 'summarize(nums: number[])')
          .replace('for (const v of values) {', 'for (const v of nums) {');
        const vvBefore = fs.readFileSync(vvAbs, 'utf8');
        const vvEdit = await callT24('atomic_edit_symbol', {
          file: vvAbs,
          selector: 'summarize',
          op: 'replace',
          code: vvNew,
        });
        const vvAfter = fs.readFileSync(vvAbs, 'utf8');
        const vvCs = vvEdit.body.changedSpan as Span | undefined;
        const vvReread = await callT24('code_read_symbol', { file: vvAbs, selector: 'summarize' });
        const vvTailLen = vvCs ? vvBefore.length - vvCs.end : -1;
        check(
          '(vv) signature+inner: one contiguous minimal span, anchors preserved, symbol === intended',
          vvEdit.body.ok === true &&
            vvEdit.body.changed === true &&
            vvNew !== vvBody &&
            String(vvReread.body.code ?? '') === vvNew &&
            /summarize\(nums: number\[\]\)/.test(vvAfter) &&
            /for \(const v of nums\) \{/.test(vvAfter) &&
            !/of values\) \{/.test(vvAfter) &&
            vvCs !== undefined &&
            vvCs.start > 0 &&
            vvCs.start < vvCs.end &&
            vvBefore.slice(0, vvCs.start) === vvAfter.slice(0, vvCs.start) &&
            vvTailLen >= 0 &&
            vvBefore.slice(vvCs.end) === vvAfter.slice(vvAfter.length - vvTailLen),
          JSON.stringify({ cs: vvCs, body: vvEdit.body }),
        );

        // (ww) degenerate near-total rewrite (no meaningful common
        // prefix/suffix) → behaves EXACTLY as the previous full-span replace,
        // syntax-validated, file correct.
        const wwAbs = path.join(t24Abs, 'ww.ts');
        fs.writeFileSync(
          wwAbs,
          ['export function gamma(x: number): number {', '  return x * 2;', '}', ''].join('\n'),
        );
        const wwNew = [
          '/* fully rewritten body */',
          'export function gamma(x: number): string {',
          '  const doubled = x + x + 1;',
          '  return `value=${doubled}`;',
          '}',
        ].join('\n');
        const wwEdit = await callT24('atomic_edit_symbol', {
          file: wwAbs,
          selector: 'gamma',
          op: 'replace',
          code: wwNew,
        });
        const wwAfter = fs.readFileSync(wwAbs, 'utf8');
        const wwCs = wwEdit.body.changedSpan as Span | undefined;
        const wwSymLen = Number(wwEdit.body.symbolLength ?? 0);
        check(
          '(ww) degenerate full rewrite still works (full-span replace preserved)',
          wwEdit.body.ok === true &&
            wwEdit.body.changed === true &&
            wwCs !== undefined &&
            wwSymLen > 0 &&
            wwCs.oldLen >= wwSymLen - 4 &&
            /\/\* fully rewritten body \*\//.test(wwAfter) &&
            /const doubled = x \+ x \+ 1;/.test(wwAfter) &&
            !/return x \* 2;/.test(wwAfter),
          JSON.stringify({ cs: wwCs, symLen: wwSymLen, body: wwEdit.body }),
        );

        // (xx) regression: prior tooldev features + the OTHER edit_symbol ops
        // are unchanged by the minimal-span change.
        // tooldev23 alias parity (code_outline {path} === {file}).
        const xxAbs = path.join(t24Abs, 'xx.ts');
        fs.writeFileSync(
          xxAbs,
          ['export function one(): number { return 1; }', 'export const two = 2;', ''].join('\n'),
        );
        const xxOlFile = await callT24('code_outline', { file: xxAbs });
        const xxOlPath = await callT24('code_outline', { path: xxAbs });
        check(
          '(xx) tooldev23 alias parity unchanged ({path} === {file})',
          xxOlFile.res.isError !== true &&
            JSON.stringify(xxOlFile.body) === JSON.stringify(xxOlPath.body) &&
            Array.isArray(xxOlFile.body.symbols) &&
            (xxOlFile.body.symbols as unknown[]).length === 2,
          JSON.stringify(xxOlFile.body),
        );

        // tooldev21/22: cross-file rename by selector covers every reference.
        fs.writeFileSync(
          path.join(t24Abs, 'rd.ts'),
          'export function compute(seed: number) { return seed + 1; }\n',
        );
        fs.writeFileSync(
          path.join(t24Abs, 're.ts'),
          'import { compute } from "./rd";\nexport const rr = compute(41);\n',
        );
        const xxRen = await callT24('atomic_rename_symbol_cross_file', {
          file: path.join(t24Abs, 'rd.ts'),
          selector: 'compute',
          newName: 'calculate',
        });
        const xxResidual = xxRen.body.residualUnresolved;
        check(
          '(xx) tooldev21/22 cross-file rename by selector still complete',
          xxRen.body.ok === true &&
            xxRen.body.changed === true &&
            /export function calculate\(/.test(fs.readFileSync(path.join(t24Abs, 'rd.ts'), 'utf8')) &&
            /calculate\(41\)/.test(fs.readFileSync(path.join(t24Abs, 're.ts'), 'utf8')) &&
            (xxResidual === undefined ||
              (Array.isArray(xxResidual) && (xxResidual as unknown[]).length === 0)),
          JSON.stringify(xxRen.body),
        );

        // remove / insert_after edit_symbol ops are UNCHANGED (no changedSpan
        // emitted for them — minimal-span applies to body-replace only).
        const ioAbs = path.join(t24Abs, 'io.ts');
        fs.writeFileSync(
          ioAbs,
          ['export function keep(): number {', '  return 7;', '}', ''].join('\n'),
        );
        const ioIns = await callT24('atomic_edit_symbol', {
          file: ioAbs,
          selector: 'keep',
          op: 'insert_after',
          code: 'export function added(): number {\n  return 8;\n}',
        });
        const ioAfterIns = fs.readFileSync(ioAbs, 'utf8');
        const ioRem = await callT24('atomic_edit_symbol', {
          file: ioAbs,
          selector: 'added',
          op: 'remove',
        });
        const ioAfterRem = fs.readFileSync(ioAbs, 'utf8');
        check(
          '(xx) insert_after/remove edit_symbol ops unchanged (no changedSpan)',
          ioIns.body.ok === true &&
            ioIns.body.changed === true &&
            ioIns.body.changedSpan === undefined &&
            /export function added\(\): number \{/.test(ioAfterIns) &&
            /export function keep\(\): number \{/.test(ioAfterIns) &&
            ioRem.body.ok === true &&
            ioRem.body.changed === true &&
            ioRem.body.changedSpan === undefined &&
            !/function added\(/.test(ioAfterRem) &&
            /export function keep\(\): number \{/.test(ioAfterRem),
          JSON.stringify({ ins: ioIns.body, rem: ioRem.body }),
        );

        // a decompose still works unchanged (THE god-file split operator).
        const decAbs = path.join(t24Abs, 'dec.ts');
        fs.writeFileSync(
          decAbs,
          [
            'export function alpha(): number { return 1; }',
            'export function beta(): number { return 2; }',
            '',
          ].join('\n'),
        );
        const xxDec = await callT24('atomic_decompose_file', {
          file: path.join(t24Rel, 'dec.ts'),
          plan: [{ symbols: ['beta'], newModule: path.join(t24Rel, 'dec-beta.ts') }],
        });
        const decOrigin = fs.readFileSync(decAbs, 'utf8');
        check(
          '(xx) decompose unchanged: beta relocated + byte-stable re-export',
          xxDec.body.ok === true &&
            fs.existsSync(path.join(t24Abs, 'dec-beta.ts')) &&
            /function beta\(\): number \{ return 2; \}/.test(
              fs.readFileSync(path.join(t24Abs, 'dec-beta.ts'), 'utf8'),
            ) &&
            /from ".\/dec-beta"/.test(decOrigin) &&
            /function alpha\(\): number \{ return 1; \}/.test(decOrigin),
          JSON.stringify(xxDec.body),
        );
      } finally {
        fs.rmSync(t24Abs, { recursive: true, force: true });
      }
    }
    // ── TOOLDEV25: atomic_transaction is now INTENTION-LEVEL. Each per-file
    // plan entry may carry high-level position-resolving `ops` (edit_symbol /
    // replace_text / insert_after_anchor / replace_range) — the SAME resolvers
    // the model uses single-file, reused not duplicated, composed in order on
    // the evolving in-memory buffer, then fed through the SAME all-or-nothing
    // in-memory validation + atomic write + rollback + aggregated trace. Plus a
    // gentle non-blocking multi-file steer. Raw-ranged / create txns unchanged.
    {
      const t25Rel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-t25.${process.pid}`);
      const t25Abs = path.join(repoRoot, t25Rel);
      fs.mkdirSync(t25Abs, { recursive: true });
      const callT25 = async (name: string, args: Record<string, unknown>) => {
        const res = (await client.callTool({ name, arguments: args })) as {
          content: { text: string }[];
          isError?: boolean;
        };
        return {
          res,
          body: JSON.parse(res.content.at(-1)?.text ?? '{}') as Record<string, unknown>,
        };
      };
      try {
        // (yy) ONE intention-level transaction: anchor-insert a DTO field +
        // selector-replace a service fn + add an import — ALL in ONE call,
        // ONE aggregated transaction result (not N), files parse, texts match.
        const dtoRel = path.join(t25Rel, 'dto.ts');
        const svcRel = path.join(t25Rel, 'svc.ts');
        fs.writeFileSync(
          path.join(t25Abs, 'dto.ts'),
          'export interface CreateUserDto {\n  name: string;\n}\n',
        );
        fs.writeFileSync(
          path.join(t25Abs, 'svc.ts'),
          'export function createUser(name: string): string {\n  return name;\n}\n',
        );
        const yy = await callT25('atomic_transaction', {
          plan: [
            {
              file: dtoRel,
              ops: [
                {
                  op: 'insert_after_anchor',
                  anchorText: '  name: string;',
                  insertText: '\n  email: string;',
                },
              ],
            },
            {
              file: svcRel,
              ops: [
                {
                  op: 'edit_symbol',
                  selector: 'createUser',
                  op2: 'replace',
                  code:
                    'export function createUser(name: string, email: string): string {\n' +
                    '  return name + email;\n}',
                },
              ],
              addImports: [{ module: './audit.js', name: 'audit' }],
            },
          ],
        });
        const dtoAfter = fs.readFileSync(path.join(t25Abs, 'dto.ts'), 'utf8');
        const svcAfter = fs.readFileSync(path.join(t25Abs, 'svc.ts'), 'utf8');
        check(
          '(yy) intention-level ops transaction: anchor-insert + selector-replace + import in ONE atomic call',
          yy.res.isError !== true &&
            yy.res.content.length === 2 && // ONE summary + ONE json => SINGLE transaction, not N op results
            yy.body.ok === true &&
            yy.body.transaction === true &&
            yy.body.filesWritten === 2 &&
            Array.isArray(yy.body.files) &&
            (yy.body.files as unknown[]).length === 2 &&
            (yy.body.files as { tracePath?: string }[]).every(
              (f) => typeof f.tracePath === 'string',
            ) &&
            dtoAfter ===
              'export interface CreateUserDto {\n  name: string;\n  email: string;\n}\n' &&
            /import \{ audit \} from ['"]\.\/audit\.js['"];/.test(svcAfter) &&
            /export function createUser\(name: string, email: string\): string \{/.test(svcAfter) &&
            /return name \+ email;/.test(svcAfter),
          JSON.stringify({ files: yy.body.files, dtoAfter, svcAfter }),
        );

        // (zz) all-or-nothing with high-level ops: one UNRESOLVABLE anchor →
        // the WHOLE transaction is refused, NOTHING written, precise per-op
        // error (file + op index + reason).
        const zzDtoRel = path.join(t25Rel, 'zz-dto.ts');
        const zzSvcRel = path.join(t25Rel, 'zz-svc.ts');
        const zzDtoSeed = 'export interface ZzDto {\n  name: string;\n}\n';
        const zzSvcSeed = 'export function zz(name: string): string {\n  return name;\n}\n';
        fs.writeFileSync(path.join(t25Abs, 'zz-dto.ts'), zzDtoSeed);
        fs.writeFileSync(path.join(t25Abs, 'zz-svc.ts'), zzSvcSeed);
        const zz = await callT25('atomic_transaction', {
          plan: [
            {
              file: zzDtoRel,
              ops: [
                {
                  op: 'insert_after_anchor',
                  anchorText: '  name: string;',
                  insertText: '\n  age: number;',
                },
              ],
            },
            {
              file: zzSvcRel,
              ops: [
                {
                  op: 'insert_after_anchor',
                  anchorText: 'THIS_ANCHOR_DOES_NOT_EXIST_ANYWHERE',
                  insertText: 'x',
                },
              ],
            },
          ],
        });
        const zzErr = zz.res.content[0]?.text ?? '';
        check(
          '(zz) one unresolvable anchor refuses the WHOLE transaction, nothing written, precise per-op error',
          zz.res.isError === true &&
            /transaction REFUSED/.test(zzErr) &&
            /zz-svc\.ts/.test(zzErr) &&
            /ops\[0\]/.test(zzErr) &&
            /insert_after_anchor/.test(zzErr) &&
            /oldText not found|failed to resolve/.test(zzErr) &&
            fs.readFileSync(path.join(t25Abs, 'zz-dto.ts'), 'utf8') === zzDtoSeed &&
            fs.readFileSync(path.join(t25Abs, 'zz-svc.ts'), 'utf8') === zzSvcSeed,
          zzErr,
        );

        // (ab) back-compat regression: a raw-ranged `edits` transaction and a
        // `create` decomposition-style transaction still behave byte-identically.
        const rawRel = path.join(t25Rel, 'raw.ts');
        fs.writeFileSync(path.join(t25Abs, 'raw.ts'), 'export const A = 1;\n');
        const abRaw = await callT25('atomic_transaction', {
          plan: [
            {
              file: rawRel,
              edits: [
                { startLine: 1, startColumn: 18, endLine: 1, endColumn: 19, newText: '9' },
              ],
            },
          ],
        });
        const genRel = path.join(t25Rel, 'gen.ts');
        const abCreate = await callT25('atomic_transaction', {
          plan: [{ file: genRel, create: 'export const G = 1;\n' }],
        });
        check(
          '(ab) raw-ranged edits + create transactions still byte-identical (no drift from ops extension)',
          abRaw.res.isError !== true &&
            abRaw.body.ok === true &&
            abRaw.body.transaction === true &&
            abRaw.body.filesWritten === 1 &&
            fs.readFileSync(path.join(t25Abs, 'raw.ts'), 'utf8') === 'export const A = 9;\n' &&
            abCreate.res.isError !== true &&
            abCreate.body.ok === true &&
            abCreate.body.transaction === true &&
            abCreate.body.filesWritten === 1 &&
            fs.readFileSync(path.join(t25Abs, 'gen.ts'), 'utf8') === 'export const G = 1;\n',
          JSON.stringify({ raw: abRaw.body, create: abCreate.body }),
        );

        // (ac) the gentle NON-BLOCKING multi-file steer. A successful
        // transaction resets the tracker; then a single-file edit does NOT
        // trigger the hint, a 2nd edit on a DIFFERENT file DOES, and the hint
        // never blocks/changes the edit.
        const acResetRel = path.join(t25Rel, 'ac-reset.ts');
        fs.writeFileSync(path.join(t25Abs, 'ac-reset.ts'), 'export const R = 0;\n');
        await callT25('atomic_transaction', {
          plan: [
            {
              file: acResetRel,
              edits: [
                { startLine: 1, startColumn: 19, endLine: 1, endColumn: 20, newText: '1' },
              ],
            },
          ],
        });
        const acARel = path.join(t25Rel, 'ac-a.ts');
        const acBRel = path.join(t25Rel, 'ac-b.ts');
        fs.writeFileSync(path.join(t25Abs, 'ac-a.ts'), 'export const FA = 1;\n');
        fs.writeFileSync(path.join(t25Abs, 'ac-b.ts'), 'export const FB = 1;\n');
        const HINT = 'multi-file coordinated change detected';
        const ac1 = await callT25('atomic_replace_text', {
          file: acARel,
          oldText: 'FA = 1',
          newText: 'FA = 2',
        });
        const ac1Summary = ac1.res.content[0]?.text ?? '';
        const ac2 = await callT25('atomic_replace_text', {
          file: acBRel,
          oldText: 'FB = 1',
          newText: 'FB = 2',
        });
        const ac2Summary = ac2.res.content[0]?.text ?? '';
        check(
          '(ac) non-blocking steer: single-file edit NO hint; 2nd different-file edit HAS hint; never blocks',
          // 1st (single distinct file) — applied, NO hint anywhere
          ac1.body.changed === true &&
            !ac1Summary.includes(HINT) &&
            !String(ac1.body.summaryForHuman ?? '').includes(HINT) &&
            fs.readFileSync(path.join(t25Abs, 'ac-a.ts'), 'utf8') ===
              'export const FA = 2;\n' &&
            // 2nd (2 distinct files) — applied UNCHANGED + hint appended
            ac2.body.changed === true &&
            ac2Summary.includes(HINT) &&
            ac2Summary.includes('atomic_transaction') &&
            String(ac2.body.summaryForHuman ?? '').includes(HINT) &&
            fs.readFileSync(path.join(t25Abs, 'ac-b.ts'), 'utf8') ===
              'export const FB = 2;\n',
          JSON.stringify({ ac1: ac1Summary, ac2: ac2Summary }),
        );

        // (ad) regression: tooldev21 selector cross-file rename, tooldev23
        // alias, tooldev24 minimal-diff edit_symbol, and a decompose all still
        // pass unchanged under the tooldev25 transaction/steer extension.
        const adDir = path.join(t25Rel, 'ad');
        const adAbs = path.join(t25Abs, 'ad');
        fs.mkdirSync(adAbs, { recursive: true });
        fs.writeFileSync(
          path.join(adAbs, 'a1.ts'),
          'export function compute(seed: number) { return seed + 1; }\n',
        );
        fs.writeFileSync(
          path.join(adAbs, 'a2.ts'),
          'import { compute } from "./a1";\nexport const z = compute(1);\n',
        );
        const adRen = await callT25('atomic_rename_symbol_cross_file', {
          file: path.join(adAbs, 'a1.ts'),
          selector: 'compute',
          newName: 'calc',
        });
        fs.writeFileSync(path.join(adAbs, 'al.ts'), 'export const VAL = 1;\n');
        const adAlias = await callT25('atomic_replace_text', {
          file: path.join(adAbs, 'al.ts'),
          find: 'VAL = 1',
          replace: 'VAL = 2',
        });
        fs.writeFileSync(
          path.join(adAbs, 'sym.ts'),
          [
            'export function summarize(values: number[]): number {',
            '  let total = 0;',
            '  for (const v of values) total += v;',
            '  return total;',
            '}',
            '',
          ].join('\n'),
        );
        const adSym = await callT25('atomic_edit_symbol', {
          file: path.join(adAbs, 'sym.ts'),
          selector: 'summarize',
          op: 'replace',
          code: [
            'export function summarize(values: number[]): number {',
            '  let total = 1;',
            '  for (const v of values) total += v;',
            '  return total;',
            '}',
          ].join('\n'),
        });
        fs.writeFileSync(
          path.join(adAbs, 'dec.ts'),
          [
            'export function alpha(): number { return 1; }',
            'export function beta(): number { return 2; }',
            '',
          ].join('\n'),
        );
        const adDec = await callT25('atomic_decompose_file', {
          file: path.join(adDir, 'dec.ts'),
          plan: [{ symbols: ['beta'], newModule: path.join(adDir, 'dec-beta.ts') }],
        });
        const adDecOrigin = fs.readFileSync(path.join(adAbs, 'dec.ts'), 'utf8');
        check(
          '(ad) tooldev21/23/24 + decompose all unchanged under tooldev25 extension',
          adRen.body.ok === true &&
            /export function calc\(/.test(fs.readFileSync(path.join(adAbs, 'a1.ts'), 'utf8')) &&
            /calc\(1\)/.test(fs.readFileSync(path.join(adAbs, 'a2.ts'), 'utf8')) &&
            adAlias.body.ok === true &&
            fs.readFileSync(path.join(adAbs, 'al.ts'), 'utf8') === 'export const VAL = 2;\n' &&
            adSym.body.ok === true &&
            adSym.body.changed === true &&
            typeof adSym.body.changedSpan === 'object' &&
            adSym.body.changedSpan !== null &&
            typeof adSym.body.symbolLength === 'number' &&
            (adSym.body.changedSpan as { oldLen: number }).oldLen <
              (adSym.body.symbolLength as number) &&
            adDec.body.ok === true &&
            fs.existsSync(path.join(adAbs, 'dec-beta.ts')) &&
            /function beta\(\): number \{ return 2; \}/.test(
              fs.readFileSync(path.join(adAbs, 'dec-beta.ts'), 'utf8'),
            ) &&
            /from ".\/dec-beta"/.test(adDecOrigin) &&
            /function alpha\(\): number \{ return 1; \}/.test(adDecOrigin),
          JSON.stringify({
            ren: adRen.body,
            alias: adAlias.body,
            sym: adSym.body,
            dec: adDec.body,
          }),
        );
      } finally {
        fs.rmSync(t25Abs, { recursive: true, force: true });
      }
    }
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
    check('outline omits fullText', !('fullText' in o), JSON.stringify(o));
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

  // read_symbol local fixture declaration inside callback scope
  {
    const localFixtureSrc = [
      "describe('buildHeuristicCatalogScore', () => {",
      '  const emptyDemographics = {',
      "    gender: 'UNKNOWN',",
      "    ageRange: 'UNKNOWN',",
      "    location: 'UNKNOWN',",
      '    confidence: 0,',
      '  };',
      '',
      "  it('handles empty messages', () => emptyDemographics);",
      '});',
      '',
    ].join('\n');
    const r = await readSymbol('opportunity.spec.ts', localFixtureSrc, 'emptyDemographics');
    check(
      'read_symbol resolves local fixture const',
      r.kind === 'VariableDeclaration' && r.code.includes('confidence: 0'),
      r.code,
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

  // edit_symbol remove variable declaration
  {
    const fixture = [
      'const mailEnvBackup = {',
      '  MAIL_HOST: process.env.MAIL_HOST,',
      '};',
      '',
      'function setMailEnv() {',
      "  process.env.MAIL_HOST = 'smtp.example.com';",
      '}',
      '',
    ].join('\n');
    const r = await editSymbol('fixture.spec.ts', fixture, 'mailEnvBackup', 'remove');
    check(
      'edit_symbol remove variable declaration ok',
      r.validation.ok &&
        !r.newText.includes('mailEnvBackup') &&
        !r.newText.includes('const ;') &&
        r.newText.includes('function setMailEnv'),
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
    const repoRoot = path.resolve(SOURCE_DIR, '..', '..', '..');
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

  const traceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-trace-root-'));
  try {
    const worktreeTrace = buildTrace({
      file: 'worker/example.ts',
      repoRoot: traceRoot,
      operator: 'atomic_replace_text',
      before: 'const a=1;',
      newText: 'const a=2;',
      inlinePreview: 'const a=[-1-]{+2+};',
      validation: { language: 'ts', before: 0, after: 0 },
      metrics: { changedChars: 1, lineRewriteSurfaceChars: 1, expansionFactorAvoided: 1 },
    });
    const shaped = shapePayload(
      levelFor(false, 'L0'),
      { ok: true },
      { inlinePreview: 'x', trace: worktreeTrace },
    );
    const tracePath = typeof shaped.tracePath === 'string' ? shaped.tracePath : '';
    check(
      'trace: writes under selected repo root',
      tracePath.startsWith('.atomic/traces/') && fs.existsSync(path.join(traceRoot, tracePath)),
      JSON.stringify(shaped),
    );
  } finally {
    fs.rmSync(traceRoot, { recursive: true, force: true });
  }
}

function partI(): void {
  process.stdout.write('Part I — mutating-op result echo cap (token economy)\n');

  // (a) SMALL edit: inline char-level proof echoed verbatim — non-technical
  //     trust on a small change is preserved (compactPreview pass-through).
  const smallPreview = 'const a=[-1-]{+2+};';
  const smallTrace = buildTrace({
    file: 'small.ts',
    operator: 'atomic_replace_literal',
    before: 'const a=1;',
    newText: 'const a=2;',
    inlinePreview: smallPreview,
    validation: { language: 'ts', before: 0, after: 0 },
    metrics: { changedChars: 1, lineRewriteSurfaceChars: 1, expansionFactorAvoided: 1 },
  });
  const small = shapePayload(
    levelFor(false, 'L1'),
    { ok: true },
    { inlinePreview: smallPreview, trace: smallTrace },
  );
  check(
    'echo-cap: small edit keeps FULL inline proof at L1',
    small.atomicDiff === smallPreview &&
      typeof small.summaryForHuman === 'string' &&
      (small.summaryForHuman as string).includes(smallPreview),
    JSON.stringify({ atomicDiff: small.atomicDiff }),
  );

  // (b) LARGE edit: synthetic inlinePreview > 4000 chars. Echo collapses to a
  //     compact verdict; the FULL char-level proof must still be on disk.
  const bigBody = `<<<BIGDIFF ${'X'.repeat(4200)} BIGDIFF>>>`;
  const traceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-echo-cap-'));
  try {
    const bigTrace = buildTrace({
      file: 'big.ts',
      repoRoot: traceRoot,
      operator: 'atomic_edit_symbol',
      before: 'a',
      newText: `a${'b'.repeat(4200)}`,
      inlinePreview: bigBody,
      validation: { language: 'ts', before: 0, after: 0 },
      metrics: { changedChars: 4200, lineRewriteSurfaceChars: 8400, expansionFactorAvoided: 2 },
    });
    const big = shapePayload(
      levelFor(false, 'L1'),
      { ok: true },
      { inlinePreview: bigBody, trace: bigTrace },
    );
    const ad = typeof big.atomicDiff === 'string' ? big.atomicDiff : '';
    const sfh = typeof big.summaryForHuman === 'string' ? big.summaryForHuman : '';
    const total = JSON.stringify(big).length;
    const tp = typeof big.tracePath === 'string' ? path.join(traceRoot, big.tracePath) : '';
    const persistedTrace: { inlinePreview?: string } =
      tp && fs.existsSync(tp) ? JSON.parse(fs.readFileSync(tp, 'utf8')) : {};
    check(
      'echo-cap: large edit collapses echo, full proof persisted to trace file',
      ad.length < 400 &&
        ad.includes('not echoed back') &&
        !sfh.includes(bigBody) &&
        total < 3000 &&
        persistedTrace.inlinePreview === bigBody,
      JSON.stringify({
        adLen: ad.length,
        total,
        persistedLen: (persistedTrace.inlinePreview ?? '').length,
      }),
    );
  } finally {
    fs.rmSync(traceRoot, { recursive: true, force: true });
  }
}

function partJ(): void {
  process.stdout.write('Part J — atomic-only-hook structured-read gate\n');
  const HOOK = path.join(SOURCE_DIR, 'atomic-only-hook.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-readgate-'));
  function ask(filePath: string): { decision: string; reason: string } {
    const input = JSON.stringify({ tool_name: 'Read', tool_input: { file_path: filePath } });
    try {
      const out = childProcess.execFileSync('node', [HOOK], { input, encoding: 'utf8' });
      const hso = JSON.parse(out).hookSpecificOutput ?? {};
      return {
        decision: String(hso.permissionDecision ?? ''),
        reason: String(hso.permissionDecisionReason ?? ''),
      };
    } catch (e) {
      return { decision: 'ERR:' + (e instanceof Error ? e.message.slice(0, 60) : String(e)), reason: '' };
    }
  }
  try {
    const bigTs = path.join(tmp, 'big.ts');
    fs.writeFileSync(bigTs, 'const x = 1;\n'.repeat(200)); // 200 lines > 140
    const smallTs = path.join(tmp, 'small.ts');
    fs.writeFileSync(smallTs, 'const x = 1;\n'.repeat(10)); // ~10 lines
    const pkg = path.join(tmp, 'package.json');
    fs.writeFileSync(pkg, '{\n'.repeat(200)); // large but .json → exempt
    const specTs = path.join(tmp, 'foo.spec.ts');
    fs.writeFileSync(specTs, 'const x = 1;\n'.repeat(200)); // large but .spec → exempt
    const readme = path.join(tmp, 'README.md');
    fs.writeFileSync(readme, 'doc line\n'.repeat(200)); // non-code
    const dirTs = path.join(tmp, 'isdir.ts');
    fs.mkdirSync(dirTs); // readFileSync → EISDIR → internal error → fail-open

    // (a) >140-line .ts source → deny with the structured-read steer
    const a = ask(bigTs);
    check(
      'read-gate: >140-line .ts source → deny + structured-read reason',
      a.decision === 'deny' &&
        a.reason.includes('code_outline') &&
        a.reason.includes('Structured-read rule'),
      JSON.stringify({ d: a.decision, r: a.reason.slice(0, 90) }),
    );
    // (b) ~10-line .ts → allow
    check('read-gate: ~10-line .ts → allow', ask(smallTs).decision === 'allow', ask(smallTs).decision);
    // (c) package.json (even large) → allow
    check('read-gate: package.json → allow', ask(pkg).decision === 'allow', ask(pkg).decision);
    // (d) large foo.spec.ts → allow (spec exempt)
    check('read-gate: large foo.spec.ts → allow', ask(specTs).decision === 'allow', ask(specTs).decision);
    // (e) README.md → allow (non-code)
    check('read-gate: README.md → allow', ask(readme).decision === 'allow', ask(readme).decision);
    // (f) >140-line .ts whose read throws → allow (fail-open on internal error)
    check(
      'read-gate: internal hook error → fail-open allow',
      ask(dirTs).decision === 'allow',
      ask(dirTs).decision,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function partH(): Promise<void> {
  process.stdout.write('Part H — symbol relocation (move + extract) live MCP\n');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');

  const repoRoot = path.resolve(SOURCE_DIR, '..', '..', '..');
  const tmpRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-mv.${process.pid}`);
  const tmpAbs = path.join(repoRoot, tmpRel);
  fs.mkdirSync(tmpAbs, { recursive: true });
  const srcRel = path.join(tmpRel, 'source.ts');
  const tgtRel = path.join(tmpRel, 'target.ts');
  const fmtRel = path.join(tmpRel, 'fmt.ts');
  const abs = (rel: string): string => path.join(repoRoot, rel);
  fs.writeFileSync(
    abs(srcRel),
    [
      "import { join } from 'node:path';",
      '',
      'export function formatId(n: number): string {',
      '  return `id-${n}`;',
      '}',
      '',
      'export function buildLabel(dir: string, n: number): string {',
      '  return join(dir, formatId(n));',
      '}',
      '',
    ].join('\n'),
  );

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['--yes', 'tsx', path.join(SOURCE_DIR, 'server.ts')],
    cwd: repoRoot,
    stderr: 'inherit',
  });
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  const readTrace = (p: unknown): Record<string, unknown> => {
    const tp = typeof p === 'string' ? path.join(repoRoot, p) : '';
    return tp && fs.existsSync(tp) ? JSON.parse(fs.readFileSync(tp, 'utf8')) : {};
  };
  try {
    await client.connect(transport);

    // ── move buildLabel into a NEW target module ──
    const mv = (await client.callTool({
      name: 'atomic_move_symbol_to_file',
      arguments: { fromFile: srcRel, symbol: 'buildLabel', toFile: tgtRel },
    })) as { content: { text: string }[] };
    const mvBody = JSON.parse(mv.content.at(-1)?.text ?? '{}');
    const srcAfter1 = fs.readFileSync(abs(srcRel), 'utf8');
    const tgtAfter1 = fs.existsSync(abs(tgtRel)) ? fs.readFileSync(abs(tgtRel), 'utf8') : '';
    check(
      'move: tool reports success + target created',
      mvBody.ok === true && mvBody.changed === true && mvBody.targetCreated === true,
      mv.content.at(-1)?.text ?? '',
    );
    check(
      'move: symbol gone from origin',
      !/function buildLabel/.test(srcAfter1),
      srcAfter1,
    );
    check(
      'move: re-export left in origin (API preserved)',
      /export\s*\{\s*buildLabel\s*\}\s*from\s*["']\.\/target["']/.test(srcAfter1),
      srcAfter1,
    );
    check(
      'move: symbol present in target',
      /function buildLabel/.test(tgtAfter1),
      tgtAfter1,
    );
    check(
      'move: needed import carried into target',
      /from\s*["']node:path["']/.test(tgtAfter1),
      tgtAfter1,
    );
    check(
      'move: origin-local dependency back-imported',
      /import\s*\{\s*formatId\s*\}\s*from\s*["']\.\/source["']/.test(tgtAfter1),
      tgtAfter1,
    );
    {
      const o = await outline(srcRel, srcAfter1);
      const t = await outline(tgtRel, tgtAfter1);
      check(
        'move: both files parse (outline succeeds)',
        o.language === 'ts' && t.language === 'ts',
        JSON.stringify({ o: o.language, t: t.language }),
      );
    }
    const mvTrace = readTrace(mvBody.toTracePath);
    check(
      'move: target trace records movementZones',
      Array.isArray(mvTrace.movementZones) &&
        (mvTrace.movementZones as unknown[]).length >= 1 &&
        (mvTrace.movementZones as { from?: string }[])[0]?.from === srcRel &&
        mvTrace.semanticImpact === 'api_preserved_implementation_moved',
      JSON.stringify(mvTrace.movementZones),
    );

    // ── extract formatId into a fresh sibling module (always re-exported) ──
    const ex = (await client.callTool({
      name: 'atomic_extract_symbol',
      arguments: { fromFile: srcRel, symbol: 'formatId', newFile: fmtRel },
    })) as { content: { text: string }[] };
    const exBody = JSON.parse(ex.content.at(-1)?.text ?? '{}');
    const srcAfter2 = fs.readFileSync(abs(srcRel), 'utf8');
    const fmtAfter = fs.existsSync(abs(fmtRel)) ? fs.readFileSync(abs(fmtRel), 'utf8') : '';
    check(
      'extract: tool reports success + new module + re-export',
      exBody.ok === true && exBody.targetCreated === true && exBody.leftReExport === true,
      ex.content.at(-1)?.text ?? '',
    );
    check(
      'extract: symbol moved out of origin into fresh module',
      !/function formatId/.test(srcAfter2) &&
        /function formatId/.test(fmtAfter) &&
        /export\s*\{\s*formatId\s*\}\s*from\s*["']\.\/fmt["']/.test(srcAfter2),
      JSON.stringify({ srcAfter2, fmtAfter }),
    );
    check(
      'extract: trace has movementZones',
      (readTrace(exBody.toTracePath).movementZones as unknown[] | undefined)?.length! >= 1,
      JSON.stringify(readTrace(exBody.toTracePath).movementZones),
    );

    // ── extract refuses to clobber an existing module ──
    const exBad = (await client.callTool({
      name: 'atomic_extract_symbol',
      arguments: { fromFile: srcRel, symbol: 'buildLabel', newFile: tgtRel },
    })) as { content: { text: string }[] };
    const exBadBody = JSON.parse(exBad.content.at(-1)?.text ?? '{}');
    check(
      'extract: refuses to overwrite an existing module',
      exBadBody.ok === false && /already exists/.test(exBadBody.error ?? exBadBody.message ?? ''),
      exBad.content.at(-1)?.text ?? '',
    );

    // ── atomic_decompose_file: one god-file → 3 cohesive modules in ONE tx ──
    const decRel = path.join(tmpRel, 'god.ts');
    const modARel = path.join(tmpRel, 'mod-a.ts');
    const modBRel = path.join(tmpRel, 'mod-b.ts');
    const modCRel = path.join(tmpRel, 'mod-c.ts');
    fs.writeFileSync(
      abs(decRel),
      [
        "import { join } from 'node:path';",
        '',
        'export function alpha(n: number): string {',
        '  return `a-${n}`;',
        '}',
        '',
        'export function beta(dir: string): string {',
        '  return join(dir, "b");',
        '}',
        '',
        'export function gamma(n: number): string {',
        '  return `${alpha(n)}-g`;',
        '}',
        '',
        'export const DELTA = 42;',
        '',
      ].join('\n'),
    );
    const dec = (await client.callTool({
      name: 'atomic_decompose_file',
      arguments: {
        file: decRel,
        plan: [
          { symbols: ['alpha', 'gamma'], newModule: modARel },
          { symbols: ['beta'], newModule: modBRel },
          { symbols: ['DELTA'], newModule: modCRel },
        ],
      },
    })) as { content: { text: string }[] };
    const decBody = JSON.parse(dec.content.at(-1)?.text ?? '{}');
    check(
      'decompose: one transaction relocates 4 symbols into 3 new modules',
      decBody.ok === true &&
        decBody.changed === true &&
        decBody.moveCount === 4 &&
        Array.isArray(decBody.modules) &&
        decBody.modules.length === 3,
      dec.content.at(-1)?.text ?? '',
    );
    const decSrc = fs.readFileSync(abs(decRel), 'utf8');
    const modA = fs.existsSync(abs(modARel)) ? fs.readFileSync(abs(modARel), 'utf8') : '';
    const modB = fs.existsSync(abs(modBRel)) ? fs.readFileSync(abs(modBRel), 'utf8') : '';
    const modC = fs.existsSync(abs(modCRel)) ? fs.readFileSync(abs(modCRel), 'utf8') : '';
    check(
      'decompose: all symbols removed from the origin',
      !/function alpha/.test(decSrc) &&
        !/function beta/.test(decSrc) &&
        !/function gamma/.test(decSrc) &&
        !/const DELTA/.test(decSrc),
      decSrc,
    );
    check(
      'decompose: typed re-exports left so original importers still resolve',
      /export\s*\{\s*alpha\s*\}\s*from\s*["']\.\/mod-a["']/.test(decSrc) &&
        /export\s*\{\s*gamma\s*\}\s*from\s*["']\.\/mod-a["']/.test(decSrc) &&
        /export\s*\{\s*beta\s*\}\s*from\s*["']\.\/mod-b["']/.test(decSrc) &&
        /export\s*\{\s*DELTA\s*\}\s*from\s*["']\.\/mod-c["']/.test(decSrc),
      decSrc,
    );
    check(
      'decompose: symbols landed in their target modules (+ needed import carried)',
      /function alpha/.test(modA) &&
        /function gamma/.test(modA) &&
        /function beta/.test(modB) &&
        /from\s*["']node:path["']/.test(modB) &&
        /DELTA\s*=\s*42/.test(modC),
      JSON.stringify({ modA, modB, modC }),
    );
    {
      const o = await outline(decRel, decSrc);
      const a2 = await outline(modARel, modA);
      const b2 = await outline(modBRel, modB);
      const c2 = await outline(modCRel, modC);
      check(
        'decompose: origin + every new module parse (outline succeeds)',
        o.language === 'ts' &&
          a2.language === 'ts' &&
          b2.language === 'ts' &&
          c2.language === 'ts',
        JSON.stringify({ o: o.language, a: a2.language, b: b2.language, c: c2.language }),
      );
    }
    const decTrace = readTrace(decBody.originTracePath);
    check(
      'decompose: single origin trace records movementZones for all 4 moves',
      Array.isArray(decTrace.movementZones) &&
        (decTrace.movementZones as unknown[]).length === 4 &&
        (decTrace.movementZones as { from?: string }[]).every((z) => z.from === decRel) &&
        decTrace.semanticImpact === 'api_preserved_implementation_moved',
      JSON.stringify(decTrace.movementZones),
    );

    // ── all-or-nothing: a bad symbol rolls everything back, no orphan module ──
    const badRel = path.join(tmpRel, 'god2.ts');
    const orphanRel = path.join(tmpRel, 'mod-x.ts');
    const badSrc = [
      'export function keep(): number {',
      '  return 1;',
      '}',
      '',
    ].join('\n');
    fs.writeFileSync(abs(badRel), badSrc);
    const decBad = (await client.callTool({
      name: 'atomic_decompose_file',
      arguments: {
        file: badRel,
        plan: [{ symbols: ['keep', 'doesNotExist'], newModule: orphanRel }],
      },
    })) as { content: { text: string }[] };
    const decBadBody = JSON.parse(decBad.content.at(-1)?.text ?? '{}');
    check(
      'decompose: all-or-nothing — bad symbol refuses, origin intact, no orphan module',
      decBadBody.ok === false &&
        !fs.existsSync(abs(orphanRel)) &&
        fs.readFileSync(abs(badRel), 'utf8') === badSrc,
      decBad.content.at(-1)?.text ?? '',
    );

    // ── AUTO BACK-IMPORT: decompose is one-shot when origin still uses a
    //    moved symbol — no manual import cleanup / verification tail.
    // (a) origin's remaining code still calls a moved symbol.
    const biaRel = path.join(tmpRel, 'bi-a.ts');
    const biaModRel = path.join(tmpRel, 'bi-a-mod.ts');
    fs.writeFileSync(
      abs(biaRel),
      [
        'export function helper(n: number): string {',
        '  return `h-${n}`;',
        '}',
        '',
        'export function keep(n: number): string {',
        '  return helper(n) + "!";',
        '}',
        '',
      ].join('\n'),
    );
    const biA = (await client.callTool({
      name: 'atomic_decompose_file',
      arguments: { file: biaRel, plan: [{ symbols: ['helper'], newModule: biaModRel }] },
    })) as { content: { text: string }[] };
    const biABody = JSON.parse(biA.content.at(-1)?.text ?? '{}');
    const biASrc = fs.readFileSync(abs(biaRel), 'utf8');
    check(
      'back-import (a): origin still uses moved symbol → consolidated import auto-added',
      biABody.ok === true &&
        biABody.originBackImportAdded === true &&
        Array.isArray(biABody.originStillReferences) &&
        biABody.originStillReferences.includes('helper') &&
        /import\s*\{\s*helper\s*\}\s*from\s*["']\.\/bi-a-mod["']/.test(biASrc) &&
        /export\s*\{\s*helper\s*\}\s*from\s*["']\.\/bi-a-mod["']/.test(biASrc) &&
        !/function helper/.test(biASrc),
      JSON.stringify({ originBackImportAdded: biABody.originBackImportAdded, biASrc }),
    );
    check(
      'back-import (a): origin parses with 0 syntax errors (no manual cleanup)',
      (await outline(biaRel, biASrc)).language === 'ts',
      biASrc,
    );

    // (b) origin references NO moved symbol → no back-import added.
    const bibRel = path.join(tmpRel, 'bi-b.ts');
    const bibModRel = path.join(tmpRel, 'bi-b-mod.ts');
    fs.writeFileSync(
      abs(bibRel),
      [
        'export function stay(): number {',
        '  return 1;',
        '}',
        '',
        'export function m1(): string {',
        '  return "a";',
        '}',
        '',
        'export function m2(): string {',
        '  return "b";',
        '}',
        '',
      ].join('\n'),
    );
    const biB = (await client.callTool({
      name: 'atomic_decompose_file',
      arguments: { file: bibRel, plan: [{ symbols: ['m1', 'm2'], newModule: bibModRel }] },
    })) as { content: { text: string }[] };
    const biBBody = JSON.parse(biB.content.at(-1)?.text ?? '{}');
    const biBSrc = fs.readFileSync(abs(bibRel), 'utf8');
    check(
      'back-import (b): origin uses no moved symbol → no back-import, refs []',
      biBBody.ok === true &&
        biBBody.originBackImportAdded === false &&
        Array.isArray(biBBody.originStillReferences) &&
        biBBody.originStillReferences.length === 0 &&
        !/import\s*\{[^}]*\bm1\b/.test(biBSrc) &&
        /export\s*\{\s*m1\s*\}\s*from\s*["']\.\/bi-b-mod["']/.test(biBSrc) &&
        (await outline(bibRel, biBSrc)).language === 'ts',
      JSON.stringify({ originBackImportAdded: biBBody.originBackImportAdded, biBSrc }),
    );

    // (c) idempotency: two moved symbols both still used → ONE consolidated
    //     import, no duplicate import declaration.
    const bicRel = path.join(tmpRel, 'bi-c.ts');
    const bicModRel = path.join(tmpRel, 'bi-c-mod.ts');
    fs.writeFileSync(
      abs(bicRel),
      [
        'export function h1(): number {',
        '  return 1;',
        '}',
        '',
        'export function h2(): number {',
        '  return 2;',
        '}',
        '',
        'export function keep(): number {',
        '  return h1() + h2();',
        '}',
        '',
      ].join('\n'),
    );
    const biC = (await client.callTool({
      name: 'atomic_decompose_file',
      arguments: { file: bicRel, plan: [{ symbols: ['h1', 'h2'], newModule: bicModRel }] },
    })) as { content: { text: string }[] };
    const biCBody = JSON.parse(biC.content.at(-1)?.text ?? '{}');
    const biCSrc = fs.readFileSync(abs(bicRel), 'utf8');
    const biCImports = (
      biCSrc.match(/import\s*\{[^}]*\}\s*from\s*["']\.\/bi-c-mod["']/g) ?? []
    );
    check(
      'back-import (c): idempotent — single consolidated import for both moved symbols',
      biCBody.ok === true &&
        biCBody.originBackImportAdded === true &&
        biCBody.originStillReferences.includes('h1') &&
        biCBody.originStillReferences.includes('h2') &&
        biCImports.length === 1 &&
        /\bh1\b/.test(biCImports[0] ?? '') &&
        /\bh2\b/.test(biCImports[0] ?? '') &&
        (await outline(bicRel, biCSrc)).language === 'ts',
      JSON.stringify({ biCImports, refs: biCBody.originStillReferences }),
    );

    // (d) conservative AST discrimination: a moved name used ONLY as a
    //     property-access member is NOT a bare ref → no back-import, origin
    //     uncorrupted, re-export + all-or-nothing intact (fallback path).
    const bidRel = path.join(tmpRel, 'bi-d.ts');
    const bidModRel = path.join(tmpRel, 'bi-d-mod.ts');
    const bidSrc0 = [
      'export function alpha(): number {',
      '  return 1;',
      '}',
      '',
      'export const obj: Record<string, number> = {};',
      '',
      'export function keep(): number {',
      '  return obj.alpha ?? 7;',
      '}',
      '',
    ].join('\n');
    fs.writeFileSync(abs(bidRel), bidSrc0);
    const biD = (await client.callTool({
      name: 'atomic_decompose_file',
      arguments: { file: bidRel, plan: [{ symbols: ['alpha'], newModule: bidModRel }] },
    })) as { content: { text: string }[] };
    const biDBody = JSON.parse(biD.content.at(-1)?.text ?? '{}');
    const biDSrc = fs.readFileSync(abs(bidRel), 'utf8');
    check(
      'back-import (d): property-access-only ref → no back-import, origin uncorrupted',
      biDBody.ok === true &&
        biDBody.originBackImportAdded === false &&
        biDBody.originStillReferences.length === 0 &&
        !/import\s*\{[^}]*\balpha\b/.test(biDSrc) &&
        /export\s*\{\s*alpha\s*\}\s*from\s*["']\.\/bi-d-mod["']/.test(biDSrc) &&
        !/function alpha/.test(biDSrc) &&
        /function keep/.test(biDSrc) &&
        (await outline(bidRel, biDSrc)).language === 'ts',
      JSON.stringify({ originBackImportAdded: biDBody.originBackImportAdded, biDSrc }),
    );

    // ── decomposition-pattern steer (A/B R16→R17) ─────────────────────────
    // Agents must use atomic_decompose_file (one all-or-nothing call), not
    // repeated atomic_create_file, to split a code_outline'd source.
    const callCreate = async (
      file: string,
      content: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      const r = (await client.callTool({
        name: 'atomic_create_file',
        arguments: { file, content },
      })) as { content: { text: string }[] };
      return JSON.parse(r.content.at(-1)?.text ?? '{}');
    };

    // (1) stem-sharing sibling after code_outline → denied with decompose steer
    const dirA = path.join(tmpRel, 'dec-steer-a');
    fs.mkdirSync(abs(dirA), { recursive: true });
    const srcARel = path.join(dirA, 'widget.service.ts');
    fs.writeFileSync(abs(srcARel), 'export const widget = 1;\n');
    await client.callTool({ name: 'code_outline', arguments: { file: srcARel } });
    const stemDeny = await callCreate(
      path.join(dirA, 'widget.tools.ts'),
      'export const widgetTools = 2;\n',
    );
    check(
      'steer: stem-sharing sibling of an outlined source is denied with decompose steer',
      stemDeny.ok === false &&
        typeof stemDeny.error === 'string' &&
        stemDeny.error.includes('atomic_decompose_file') &&
        stemDeny.error.includes(srcARel),
      JSON.stringify(stemDeny),
    );
    check(
      'steer: stem-sharing denied module was NOT written to disk',
      !fs.existsSync(abs(path.join(dirA, 'widget.tools.ts'))),
      abs(path.join(dirA, 'widget.tools.ts')),
    );

    // (2) 1st non-stem sibling allowed; 2nd sibling-create → denied
    const dirB = path.join(tmpRel, 'dec-steer-b');
    fs.mkdirSync(abs(dirB), { recursive: true });
    const srcBRel = path.join(dirB, 'panel.service.ts');
    fs.writeFileSync(abs(srcBRel), 'export const panel = 1;\n');
    await client.callTool({ name: 'code_outline', arguments: { file: srcBRel } });
    const firstSibling = await callCreate(
      path.join(dirB, 'helpers-one.ts'),
      'export const h1 = 1;\n',
    );
    check(
      'steer: 1st non-stem sibling of an outlined source is still allowed',
      firstSibling.ok === true &&
        fs.existsSync(abs(path.join(dirB, 'helpers-one.ts'))),
      JSON.stringify(firstSibling),
    );
    const secondSibling = await callCreate(
      path.join(dirB, 'helpers-two.ts'),
      'export const h2 = 2;\n',
    );
    check(
      'steer: 2nd sibling-create after outline is denied with decompose steer',
      secondSibling.ok === false &&
        typeof secondSibling.error === 'string' &&
        secondSibling.error.includes('atomic_decompose_file') &&
        secondSibling.error.includes(srcBRel) &&
        !fs.existsSync(abs(path.join(dirB, 'helpers-two.ts'))),
      JSON.stringify(secondSibling),
    );

    // (3) genuine standalone new file (unrelated dir, no shared stem) → allowed
    const dirC = path.join(tmpRel, 'dec-steer-standalone');
    fs.mkdirSync(abs(dirC), { recursive: true });
    const standalone = await callCreate(
      path.join(dirC, 'brand-new.ts'),
      'export const brandNew = 42;\n',
    );
    check(
      'steer: genuine standalone create (unrelated dir, no shared stem) still allowed',
      standalone.ok === true &&
        fs.existsSync(abs(path.join(dirC, 'brand-new.ts'))),
      JSON.stringify(standalone),
    );

    // ── AUTO-EXECUTE: creating a derived sibling of an OUTLINED god-file is the
    //    decomposition pattern. The OS no longer denies + hands back a copy-
    //    paste readyCall — it AUTO-EXECUTES the full atomic_decompose_file
    //    transaction itself and returns the executed decompose result. ────────
    const dirR = path.join(tmpRel, 'dec-ready');
    fs.mkdirSync(abs(dirR), { recursive: true });
    const srcRRel = path.join(dirR, 'inbox.service.ts');
    fs.writeFileSync(
      abs(srcRRel),
      [
        'export function loadInbox(): string { return "i"; }',
        'export function loadThread(): string { return "t"; }',
        'export function loadMessage(): string { return "m"; }',
        'export function sendMessage(): string { return "s"; }',
        'export function sendDraft(): string { return "d"; }',
        'export function parseEnvelope(): string { return "e"; }',
        'export function parseHeader(): string { return "h"; }',
        'export const INBOX_LIMIT = 100;',
        '',
      ].join('\n'),
    );
    const oR = await outline(srcRRel, fs.readFileSync(abs(srcRRel), 'utf8'));
    const outlineTop = new Set(
      oR.symbols.map((sym) => sym.selector).filter((sel) => !sel.includes('.')),
    );
    await client.callTool({ name: 'code_outline', arguments: { file: srcRRel } });
    const autoRaw = (await client.callTool({
      name: 'atomic_create_file',
      arguments: {
        file: path.join(dirR, 'inbox.helpers.ts'),
        content: 'export const x = 1;\n',
      },
    })) as { content: { text: string }[] };
    // Robust: the create may legitimately auto-execute (JSON body) OR, on any
    // decompose failure, safely fall back to the prior deny — never crash the
    // harness by blindly JSON.parsing a non-JSON ("MCP error …") string.
    const autoText = autoRaw.content.map((c) => c.text ?? '').join('\n');
    let autoBody: {
      ok?: boolean;
      changed?: boolean;
      modules?: { module: string; symbols: string[]; reExport?: boolean }[];
      movedSymbols?: string[];
      originBackImportAdded?: boolean;
      originStillReferences?: string[];
      summaryForHuman?: string;
      readyCall?: unknown;
      error?: string;
    } = {};
    try {
      autoBody = JSON.parse(autoRaw.content.at(-1)?.text ?? '{}');
    } catch {
      autoBody = { error: autoRaw.content.at(-1)?.text ?? '' };
    }
    const autoMods = Array.isArray(autoBody.modules) ? autoBody.modules : [];
    check(
      'auto-execute: decomposition create AUTO-EXECUTES atomic_decompose_file (ok:true, no readyCall)',
      autoBody.ok === true &&
        autoBody.changed === true &&
        autoBody.readyCall === undefined &&
        autoText.includes('AUTO-EXECUTED') &&
        autoMods.length >= 3 &&
        autoMods.every(
          (m) =>
            Array.isArray(m.symbols) &&
            m.symbols.length > 0 &&
            m.reExport !== false,
        ),
      JSON.stringify({
        ok: autoBody.ok,
        changed: autoBody.changed,
        hasReadyCall: autoBody.readyCall !== undefined,
        modules: autoMods,
        snippet: autoText.slice(0, 240),
      }),
    );
    // Subset-coverage intent preserved: every relocated symbol must be a
    // member of the source's own top-level code_outline — now read from the
    // EXECUTED decompose result (modules[].symbols / movedSymbols), not from
    // a readyCall.plan that no longer exists.
    const autoSyms = [
      ...autoMods.flatMap((m) => m.symbols),
      ...(Array.isArray(autoBody.movedSymbols) ? autoBody.movedSymbols : []),
    ];
    check(
      'auto-execute: every relocated symbol is a subset of the source outline',
      autoSyms.length > 0 && autoSyms.every((sym) => outlineTop.has(sym)),
      JSON.stringify({ autoSyms, outline: [...outlineTop] }),
    );
    const srcRAfter = fs.readFileSync(abs(srcRRel), 'utf8');
    check(
      'auto-execute: origin keeps typed re-exports and symbols were relocated out',
      /export\s*\{[^}]*loadInbox[^}]*\}\s*from/.test(srcRAfter) &&
        !/function loadInbox/.test(srcRAfter) &&
        !/const INBOX_LIMIT/.test(srcRAfter),
      srcRAfter,
    );
    {
      let allValid =
        (await outline(srcRRel, srcRAfter)).language === 'ts' &&
        autoMods.length > 0;
      for (const m of autoMods) {
        if (!fs.existsSync(abs(m.module))) {
          allValid = false;
          break;
        }
        const mt = fs.readFileSync(abs(m.module), 'utf8');
        if ((await outline(m.module, mt)).language !== 'ts') {
          allValid = false;
          break;
        }
      }
      check(
        'auto-execute: origin + every auto-generated module exist and parse after decompose',
        allValid,
        JSON.stringify(autoMods.map((m) => m.module)),
      );
    }

    // ── TOOLDEV11 IDEMPOTENCY GUARD (A/B R22 regression fix). A file that
    //    was already structurally decomposed this session is STRUCTURALLY
    //    COMPLETE: re-decomposing it (the R22 self-inflicted 3-pass churn)
    //    must HARD-STOP, and the FIRST success must carry an unambiguous
    //    terminal directive so the model stops re-structuring. ───────────
    // (d) the first successful auto-execute result carries the terminal
    //     STRUCTURALLY-COMPLETE directive.
    check(
      'idempotency (d): first auto-execute result carries the terminal STRUCTURALLY COMPLETE directive',
      /TASK STRUCTURALLY COMPLETE/.test(autoText) &&
        /run the test suite/i.test(autoText) &&
        /do NOT decompose again/i.test(autoText),
      autoText.slice(0, 400),
    );
    // (b) a 2nd create_file decomposition trigger on the SAME already
    //     auto-decomposed origin must HARD-STOP (no 2nd auto-decompose,
    //     nothing written).
    const auto2Raw = (await client.callTool({
      name: 'atomic_create_file',
      arguments: {
        file: path.join(dirR, 'inbox.more.ts'),
        content: 'export const y = 2;\n',
      },
    })) as { content: { text: string }[] };
    const auto2Text = auto2Raw.content.map((c) => c.text ?? '').join('\n');
    let auto2Body: { ok?: boolean; changed?: boolean } = {};
    try {
      auto2Body = JSON.parse(auto2Raw.content.at(-1)?.text ?? '{}');
    } catch {
      auto2Body = {};
    }
    check(
      'idempotency (b): 2nd create_file decomposition trigger on already-decomposed origin HARD-STOPS',
      /ALREADY decomposed/i.test(auto2Text) &&
        /run the test suite/i.test(auto2Text) &&
        auto2Body.ok !== true &&
        auto2Body.changed !== true &&
        !fs.existsSync(abs(path.join(dirR, 'inbox.more.ts'))),
      auto2Text.slice(0, 300),
    );
    // (a) explicit atomic_decompose_file: first call succeeds + carries the
    //     terminal directive; a 2nd explicit call on the SAME origin
    //     HARD-STOPS (ok:false, nothing written).
    const dirI = path.join(tmpRel, 'dec-idem');
    fs.mkdirSync(abs(dirI), { recursive: true });
    const srcIRel = path.join(dirI, 'orders.service.ts');
    fs.writeFileSync(
      abs(srcIRel),
      [
        'export function createOrder(): string { return "c"; }',
        'export function cancelOrder(): string { return "x"; }',
        'export function listOrders(): string { return "l"; }',
        'export function shipOrder(): string { return "s"; }',
        '',
      ].join('\n'),
    );
    const dec1Raw = (await client.callTool({
      name: 'atomic_decompose_file',
      arguments: {
        file: srcIRel,
        plan: [
          {
            symbols: ['createOrder', 'cancelOrder'],
            newModule: path.join(dirI, 'orders.write.ts'),
            reExport: true,
          },
          {
            symbols: ['listOrders', 'shipOrder'],
            newModule: path.join(dirI, 'orders.read.ts'),
            reExport: true,
          },
        ],
      },
    })) as { content: { text: string }[] };
    const dec1Text = dec1Raw.content.map((c) => c.text ?? '').join('\n');
    let dec1Body: { ok?: boolean } = {};
    try {
      dec1Body = JSON.parse(dec1Raw.content.at(-1)?.text ?? '{}');
    } catch {
      dec1Body = {};
    }
    check(
      'idempotency (a1): first explicit atomic_decompose_file succeeds + carries terminal directive',
      dec1Body.ok === true &&
        /TASK STRUCTURALLY COMPLETE/.test(dec1Text) &&
        /do NOT decompose again/i.test(dec1Text),
      dec1Text.slice(0, 400),
    );
    const ordersWriteAbs = abs(path.join(dirI, 'orders.write.ts'));
    const beforeReDecomp = fs.existsSync(ordersWriteAbs)
      ? fs.readFileSync(ordersWriteAbs, 'utf8')
      : '';
    const dec2Raw = (await client.callTool({
      name: 'atomic_decompose_file',
      arguments: {
        file: srcIRel,
        plan: [
          {
            symbols: ['createOrder'],
            newModule: path.join(dirI, 'orders.again.ts'),
            reExport: true,
          },
        ],
      },
    })) as { content: { text: string }[] };
    const dec2Text = dec2Raw.content.map((c) => c.text ?? '').join('\n');
    let dec2Body: { ok?: boolean; changed?: boolean } = {};
    try {
      dec2Body = JSON.parse(dec2Raw.content.at(-1)?.text ?? '{}');
    } catch {
      dec2Body = {};
    }
    check(
      'idempotency (a2): 2nd explicit atomic_decompose_file on same origin HARD-STOPS (nothing written)',
      /ALREADY decomposed/i.test(dec2Text) &&
        /run the test suite/i.test(dec2Text) &&
        dec2Body.ok !== true &&
        dec2Body.changed !== true &&
        !fs.existsSync(abs(path.join(dirI, 'orders.again.ts'))) &&
        (fs.existsSync(ordersWriteAbs)
          ? fs.readFileSync(ordersWriteAbs, 'utf8')
          : '') === beforeReDecomp,
      dec2Text.slice(0, 300),
    );
    // (c) a DIFFERENT origin still decomposes normally — the guard is
    //     per-file, never a global lock.
    const srcICRel = path.join(dirI, 'billing.service.ts');
    fs.writeFileSync(
      abs(srcICRel),
      [
        'export function charge(): string { return "c"; }',
        'export function refund(): string { return "r"; }',
        'export function invoice(): string { return "i"; }',
        'export function dunning(): string { return "d"; }',
        '',
      ].join('\n'),
    );
    const decCRaw = (await client.callTool({
      name: 'atomic_decompose_file',
      arguments: {
        file: srcICRel,
        plan: [
          {
            symbols: ['charge', 'refund'],
            newModule: path.join(dirI, 'billing.money.ts'),
            reExport: true,
          },
          {
            symbols: ['invoice', 'dunning'],
            newModule: path.join(dirI, 'billing.docs.ts'),
            reExport: true,
          },
        ],
      },
    })) as { content: { text: string }[] };
    let decCBody: { ok?: boolean } = {};
    try {
      decCBody = JSON.parse(decCRaw.content.at(-1)?.text ?? '{}');
    } catch {
      decCBody = {};
    }
    check(
      'idempotency (c): a DIFFERENT origin still decomposes normally (per-file, not global)',
      decCBody.ok === true &&
        fs.existsSync(abs(path.join(dirI, 'billing.money.ts'))) &&
        fs.existsSync(abs(path.join(dirI, 'billing.docs.ts'))),
      JSON.stringify(decCBody).slice(0, 300),
    );

    // ── (d) class-method decompose: a `ClassName.method` plan extracts the
    //    METHODS (the dominant real shape) into a new module while the origin
    //    class public API stays byte-stable; the idempotency guard still
    //    fires on a 2nd decompose of that class origin. ─────────────────────
    const clsRel = path.join(dirI, 'agent.service.ts');
    const clsModRel = path.join(dirI, 'agent.helpers.ts');
    fs.writeFileSync(
      abs(clsRel),
      [
        'export class AgentService {',
        '  private base = 2;',
        '  alpha(n: number): number { return n + 1; }',
        '  beta(s: string): string { return `[${s}]`; }',
        '  gamma(): number { return this.base; }',
        '}',
        '',
      ].join('\n'),
    );
    const decM = (await client.callTool({
      name: 'atomic_decompose_file',
      arguments: {
        file: clsRel,
        plan: [
          { symbols: ['AgentService.alpha', 'AgentService.beta'], newModule: clsModRel },
        ],
      },
    })) as { content: { text: string }[] };
    let decMBody: { ok?: boolean; moveCount?: number } = {};
    try {
      decMBody = JSON.parse(decM.content.at(-1)?.text ?? '{}');
    } catch {
      decMBody = {};
    }
    const clsAfter = fs.existsSync(abs(clsRel)) ? fs.readFileSync(abs(clsRel), 'utf8') : '';
    const clsMod = fs.existsSync(abs(clsModRel))
      ? fs.readFileSync(abs(clsModRel), 'utf8')
      : '';
    check(
      'decompose(method): ClassName.method plan extracts both methods into the new module',
      decMBody.ok === true &&
        decMBody.moveCount === 2 &&
        /export function alpha\s*\(/.test(clsMod) &&
        /export function beta\s*\(/.test(clsMod),
      JSON.stringify(decMBody).slice(0, 200) + ' || ' + clsMod,
    );
    check(
      'decompose(method): origin class API byte-stable (methods kept + delegate)',
      /class AgentService/.test(clsAfter) &&
        /\balpha\(n: number\): number\b/.test(clsAfter) &&
        /\bbeta\(s: string\): string\b/.test(clsAfter) &&
        /return alpha\(/.test(clsAfter) &&
        /return beta\(/.test(clsAfter),
      clsAfter,
    );
    {
      const o = await outline(clsRel, clsAfter);
      const m = await outline(clsModRel, clsMod);
      check(
        'decompose(method): origin + new module both parse',
        o.language === 'ts' && m.language === 'ts',
        JSON.stringify({ o: o.language, m: m.language }),
      );
    }
    const decM2 = (await client.callTool({
      name: 'atomic_decompose_file',
      arguments: {
        file: clsRel,
        plan: [
          { symbols: ['AgentService.gamma'], newModule: path.join(dirI, 'agent.more.ts') },
        ],
      },
    })) as { content: { text: string }[] };
    const decM2Text = decM2.content.at(-1)?.text ?? '';
    check(
      'decompose(method): idempotency guard still fires on a 2nd decompose of the class origin',
      /ALREADY decomposed/i.test(decM2Text) &&
        !fs.existsSync(abs(path.join(dirI, 'agent.more.ts'))),
      decM2Text.slice(0, 300),
    );

    // ── A/B TOOLDEV13 — GOD-CLASS auto-plan. The dominant real shape is a
    //    NestJS service CLASS whose decomposable units are its METHODS, not
    //    top-level functions. recordOutline must capture `Class.method`
    //    selectors and the create_file auto-execute must split the class in
    //    ONE atomic_decompose_file (the R24 hand-roll explosion fix). ───────
    const dirGC = path.join(tmpRel, 'god-class');
    fs.mkdirSync(abs(dirGC), { recursive: true });
    const gcRel = path.join(dirGC, 'unified-agent.service.ts');
    fs.writeFileSync(
      abs(gcRel),
      [
        'export class UnifiedAgentService {',
        '  base = 2;',
        '  handleInbound(n: number): number { return n + this.base; }',
        '  handleOutbound(n: number): number { return n - this.base; }',
        '  handleTimeout(): number { return this.base; }',
        '  loadProfile(id: string): string { return `p:${id}`; }',
        '  loadHistory(id: string): string { return `h:${id}`; }',
        '  sendReply(s: string): string { return `r:${s}`; }',
        '  sendDigest(s: string): string { return `d:${s}`; }',
        '  buildContext(): string { return `ctx:${this.base}`; }',
        '}',
        'export const AGENT_VERSION = 1;',
        '',
      ].join('\n'),
    );
    const gcOutline = await outline(gcRel, fs.readFileSync(abs(gcRel), 'utf8'));
    const gcMethodSel = new Set(
      gcOutline.symbols
        .filter((sym) => sym.kind === 'MethodDeclaration')
        .map((sym) => sym.selector),
    );
    await client.callTool({ name: 'code_outline', arguments: { file: gcRel } });
    const gcRaw = (await client.callTool({
      name: 'atomic_create_file',
      arguments: {
        file: path.join(dirGC, 'unified-agent.helpers.ts'),
        content: 'export const x = 1;\n',
      },
    })) as { content: { text: string }[] };
    const gcText = gcRaw.content.map((c) => c.text ?? '').join('\n');
    let gcBody: {
      ok?: boolean;
      changed?: boolean;
      modules?: { module: string; symbols: string[]; reExport?: boolean }[];
      movedSymbols?: string[];
      readyCall?: unknown;
    } = {};
    try {
      gcBody = JSON.parse(gcRaw.content.at(-1)?.text ?? '{}');
    } catch {
      gcBody = {};
    }
    const gcMods = Array.isArray(gcBody.modules) ? gcBody.modules : [];
    // The PRODUCED PLAN is modules[].symbols — that is what must be
    // `Class.method` selectors. (movedSymbols is the post-execution
    // engine-resolved bare member name and is intentionally not asserted
    // here — the plan, not the resolved name, is the tooldev13 contract.)
    const gcPlanSyms = gcMods.flatMap((m) => m.symbols);
    // (f) the produced plan's symbols are `ClassName.method` selectors
    //     grouped into >=3 modules — NOT null, NOT just the class name.
    check(
      'TOOLDEV13 (f): god-class create AUTO-EXECUTES a CLASS-METHOD decompose (>=3 modules, Class.method selectors)',
      gcBody.ok === true &&
        gcBody.changed === true &&
        gcBody.readyCall === undefined &&
        gcText.includes('AUTO-EXECUTED') &&
        gcMods.length >= 3 &&
        gcPlanSyms.length >= 6 &&
        gcPlanSyms.every(
          (s) => s.startsWith('UnifiedAgentService.') && gcMethodSel.has(s),
        ) &&
        !gcPlanSyms.includes('UnifiedAgentService'),
      JSON.stringify({ mods: gcMods, plan: gcPlanSyms }).slice(0, 400),
    );
    const gcAfter = fs.readFileSync(abs(gcRel), 'utf8');
    // (g) methods extracted as helpers; origin class kept with delegating
    //     stubs; origin + modules parse; public class API byte-stable.
    check(
      'TOOLDEV13 (g): origin class kept with delegating method stubs, public API byte-stable',
      /class UnifiedAgentService/.test(gcAfter) &&
        /\bhandleInbound\(n: number\): number\b/.test(gcAfter) &&
        /\bloadProfile\(id: string\): string\b/.test(gcAfter) &&
        /\bbuildContext\(\): string\b/.test(gcAfter) &&
        /return handleInbound\(/.test(gcAfter) &&
        /return loadProfile\(/.test(gcAfter),
      gcAfter,
    );
    {
      let allParse =
        (await outline(gcRel, gcAfter)).language === 'ts' && gcMods.length > 0;
      let helpersFound = false;
      for (const m of gcMods) {
        if (!fs.existsSync(abs(m.module))) {
          allParse = false;
          break;
        }
        const mt = fs.readFileSync(abs(m.module), 'utf8');
        if ((await outline(m.module, mt)).language !== 'ts') {
          allParse = false;
          break;
        }
        if (/export function \w+\s*\(/.test(mt)) helpersFound = true;
      }
      check(
        'TOOLDEV13 (g): origin + every god-class module exist, parse, and contain extracted helper functions',
        allParse && helpersFound,
        JSON.stringify(gcMods.map((m) => m.module)),
      );
    }
    // (g) a 2nd create_file decomposition trigger on the SAME class origin
    //     HARD-STOPS (idempotency intact, nothing written).
    const gc2Raw = (await client.callTool({
      name: 'atomic_create_file',
      arguments: {
        file: path.join(dirGC, 'unified-agent.more.ts'),
        content: 'export const y = 2;\n',
      },
    })) as { content: { text: string }[] };
    const gc2Text = gc2Raw.content.map((c) => c.text ?? '').join('\n');
    let gc2Body: { ok?: boolean; changed?: boolean } = {};
    try {
      gc2Body = JSON.parse(gc2Raw.content.at(-1)?.text ?? '{}');
    } catch {
      gc2Body = {};
    }
    check(
      'TOOLDEV13 (g): 2nd create_file trigger on already-decomposed class origin HARD-STOPS (idempotency intact)',
      /ALREADY decomposed/i.test(gc2Text) &&
        gc2Body.ok !== true &&
        gc2Body.changed !== true &&
        !fs.existsSync(abs(path.join(dirGC, 'unified-agent.more.ts'))),
      gc2Text.slice(0, 300),
    );
    // (h) REGRESSION: a genuinely top-level-symbol file still auto-executes
    //     the SAME top-level plan — bare (no-dot) selectors, >=3 modules,
    //     unchanged behavior for non-class files.
    const dirTL = path.join(tmpRel, 'top-level-reg');
    fs.mkdirSync(abs(dirTL), { recursive: true });
    const tlRel = path.join(dirTL, 'orders.toolkit.ts');
    fs.writeFileSync(
      abs(tlRel),
      [
        'export function createOrder(): string { return "c"; }',
        'export function cancelOrder(): string { return "x"; }',
        'export function listOrders(): string { return "l"; }',
        'export function shipOrder(): string { return "s"; }',
        'export function trackOrder(): string { return "t"; }',
        'export const ORDER_CAP = 50;',
        '',
      ].join('\n'),
    );
    const tlTop = new Set(
      (await outline(tlRel, fs.readFileSync(abs(tlRel), 'utf8'))).symbols
        .map((sym) => sym.selector)
        .filter((sel) => !sel.includes('.')),
    );
    await client.callTool({ name: 'code_outline', arguments: { file: tlRel } });
    const tlRaw = (await client.callTool({
      name: 'atomic_create_file',
      arguments: {
        file: path.join(dirTL, 'orders.helpers.ts'),
        content: 'export const z = 1;\n',
      },
    })) as { content: { text: string }[] };
    let tlBody: {
      ok?: boolean;
      modules?: { module: string; symbols: string[] }[];
      movedSymbols?: string[];
    } = {};
    try {
      tlBody = JSON.parse(tlRaw.content.at(-1)?.text ?? '{}');
    } catch {
      tlBody = {};
    }
    const tlMods = Array.isArray(tlBody.modules) ? tlBody.modules : [];
    const tlMoved = [
      ...tlMods.flatMap((m) => m.symbols),
      ...(Array.isArray(tlBody.movedSymbols) ? tlBody.movedSymbols : []),
    ];
    check(
      'TOOLDEV13 (h): regression — top-level file still auto-executes the SAME top-level plan (bare no-dot selectors, >=3 modules)',
      tlBody.ok === true &&
        tlMods.length >= 3 &&
        tlMoved.length >= 3 &&
        tlMoved.every((s) => !s.includes('.') && tlTop.has(s)),
      JSON.stringify({ mods: tlMods, moved: tlMoved }).slice(0, 400),
    );

    // ════════════════════════════════════════════════════════════════════
    // TOOLDEV14 — measured self-certification: a successful decompose emits
    // a verdict so the model HALTS at the minimal sufficient action instead
    // of launching a 2nd (wasteful) restructuring wave.
    // ════════════════════════════════════════════════════════════════════
    const locOf = (s: string): number =>
      s.length === 0 ? 0 : s.split('\n').length;
    // (i) result fits the target → TARGET MET, STRUCTURALLY COMPLETE, run
    //     the spec, STOP restructuring, with the MEASURED origin number.
    {
      const dirT14 = path.join(tmpRel, 'tooldev14-met');
      fs.mkdirSync(abs(dirT14), { recursive: true });
      const oRel = path.join(dirT14, 'small.ts');
      fs.writeFileSync(
        abs(oRel),
        [
          'export function a1(): number { return 1; }',
          'export function a2(): number { return 2; }',
          'export function a3(): number { return 3; }',
          '',
        ].join('\n'),
      );
      const decI = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: oRel,
          plan: [
            { symbols: ['a1', 'a2'], newModule: path.join(dirT14, 'm1.ts') },
            { symbols: ['a3'], newModule: path.join(dirT14, 'm2.ts') },
          ],
        },
      })) as { content: { text: string }[] };
      const decIText = decI.content.map((c) => c.text ?? '').join('\n');
      const decIBody = JSON.parse(decI.content.at(-1)?.text ?? '{}');
      const originLocI = locOf(fs.readFileSync(abs(oRel), 'utf8'));
      check(
        'TOOLDEV14 (i): fitting decompose self-certifies TARGET MET + STRUCTURALLY COMPLETE + run the spec + STOP restructuring (measured origin N)',
        decIBody.ok === true &&
          decIText.includes('TARGET MET') &&
          decIText.includes('STRUCTURALLY COMPLETE') &&
          decIText.includes('run the spec') &&
          decIText.includes('STOP restructuring') &&
          decIText.includes(`origin ${originLocI} ≤ 350`) &&
          !!decIBody.completionVerdict &&
          decIBody.completionVerdict.met === true &&
          decIBody.completionVerdict.originLoc === originLocI,
        decIText.slice(0, 300),
      );
    }
    // (j) A/B TOOLDEV19 ADJUSTED (was: over-module → ▶ PROGRESS "single
    //     smallest next" — that multi-pass verdict is structurally removed).
    //     The terminal verdict is now keyed on the ORIGIN LOC vs the oracle:
    //     origin (tinyFn only) ≤ 350 → ✅ TARGET MET, met===true, EVEN THOUGH
    //     the single extracted module is > 400 LOC. Module sizing is a
    //     bin-packing concern of the planner, NOT a re-loop trigger; there is
    //     no "do one more pass" advice anymore (one converged call is the end
    //     state). Asserts no PROGRESS text survives.
    {
      const dirT14b = path.join(tmpRel, 'tooldev14-progress');
      fs.mkdirSync(abs(dirT14b), { recursive: true });
      const oRel = path.join(dirT14b, 'heavy.ts');
      const bigBody: string[] = ['export function bigFn(): number {'];
      for (let i = 0; i < 460; i++) bigBody.push(`  const v${i} = ${i};`);
      bigBody.push('  return v0;', '}');
      fs.writeFileSync(
        abs(oRel),
        [...bigBody, '', 'export function tinyFn(): number { return 7; }', ''].join(
          '\n',
        ),
      );
      const decJ = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: oRel,
          plan: [{ symbols: ['bigFn'], newModule: path.join(dirT14b, 'big.ts') }],
        },
      })) as { content: { text: string }[] };
      const decJText = decJ.content.map((c) => c.text ?? '').join('\n');
      const decJBody = JSON.parse(decJ.content.at(-1)?.text ?? '{}');
      const maxModJ = decJBody.completionVerdict
        ? decJBody.completionVerdict.maxModuleLoc
        : 0;
      const originLocJ = locOf(fs.readFileSync(abs(oRel), 'utf8'));
      check(
        'TOOLDEV19 (j): over-MODULE decompose with origin ≤ 350 → terminal TARGET MET (met===true), NO PROGRESS text, module size is a bin-packing concern not a re-loop trigger',
        decJBody.ok === true &&
          decJText.includes('TARGET MET') &&
          !decJText.includes('PROGRESS') &&
          decJText.includes(`origin ${originLocJ} ≤ 350`) &&
          /bin-packing concern, not a re-loop trigger/.test(decJText) &&
          !!decJBody.completionVerdict &&
          decJBody.completionVerdict.met === true &&
          originLocJ <= 350 &&
          maxModJ > 400,
        decJText.slice(0, 300),
      );
    }
    // (k) god-class auto-execute (create_file trigger) when result fits →
    //     the auto STOP banner LEADS with TARGET MET … STOP restructuring.
    {
      const dirGC14 = path.join(tmpRel, 'tooldev14-gc');
      fs.mkdirSync(abs(dirGC14), { recursive: true });
      const gcRel = path.join(dirGC14, 'unified-agent.service.ts');
      fs.writeFileSync(
        abs(gcRel),
        [
          'export class UnifiedAgentService {',
          '  base = 2;',
          '  handleInbound(n: number): number { return n + this.base; }',
          '  handleOutbound(n: number): number { return n - this.base; }',
          '  handleTimeout(): number { return this.base; }',
          '  loadProfile(id: string): string { return `p:${id}`; }',
          '  loadHistory(id: string): string { return `h:${id}`; }',
          '  sendReply(s: string): string { return `r:${s}`; }',
          '  sendDigest(s: string): string { return `d:${s}`; }',
          '  buildContext(): string { return `ctx:${this.base}`; }',
          '}',
          'export const AGENT_VERSION = 1;',
          '',
        ].join('\n'),
      );
      await client.callTool({ name: 'code_outline', arguments: { file: gcRel } });
      const gc14Raw = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirGC14, 'unified-agent.helpers.ts'),
          content: 'export const x = 1;\n',
        },
      })) as { content: { text: string }[] };
      const gc14Text = gc14Raw.content.map((c) => c.text ?? '').join('\n');
      let gc14Body: { ok?: boolean; completionVerdict?: { met?: boolean } } = {};
      try {
        gc14Body = JSON.parse(gc14Raw.content.at(-1)?.text ?? '{}');
      } catch {
        gc14Body = {};
      }
      check(
        'TOOLDEV14 (k): god-class create_file auto-execute STOP banner LEADS with TARGET MET … STOP restructuring (self-certifies through the auto path)',
        gc14Body.ok === true &&
          gc14Text.includes('TARGET MET') &&
          gc14Text.includes('STOP restructuring') &&
          gc14Text.indexOf('TARGET MET') < gc14Text.indexOf('AUTO-EXECUTED') &&
          gc14Body.completionVerdict?.met === true,
        gc14Text.slice(0, 300),
      );
    }
    // (l) regression: a normal top-level decompose still succeeds (now also
    //     carrying the verdict) AND a 2nd decompose of the same origin still
    //     HARD-STOPS (idempotency intact, nothing written).
    {
      const dirT14r = path.join(tmpRel, 'tooldev14-reg');
      fs.mkdirSync(abs(dirT14r), { recursive: true });
      const oRel = path.join(dirT14r, 'top.ts');
      fs.writeFileSync(
        abs(oRel),
        [
          'export function p(): number { return 1; }',
          'export function q(): number { return 2; }',
          '',
        ].join('\n'),
      );
      const reg1 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: oRel,
          plan: [{ symbols: ['p', 'q'], newModule: path.join(dirT14r, 'pq.ts') }],
        },
      })) as { content: { text: string }[] };
      const reg1Body = JSON.parse(reg1.content.at(-1)?.text ?? '{}');
      const reg2 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: oRel,
          plan: [{ symbols: ['p'], newModule: path.join(dirT14r, 'p2.ts') }],
        },
      })) as { content: { text: string }[] };
      const reg2Text = reg2.content.map((c) => c.text ?? '').join('\n');
      const reg2Body = JSON.parse(reg2.content.at(-1)?.text ?? '{}');
      check(
        'TOOLDEV14 (l): regression — top-level decompose still succeeds (with verdict) AND 2nd decompose still HARD-STOPS',
        reg1Body.ok === true &&
          reg1Body.changed === true &&
          !!reg1Body.completionVerdict &&
          reg1Body.completionVerdict.met === true &&
          reg2Body.ok !== true &&
          /ALREADY decomposed/i.test(reg2Text) &&
          !fs.existsSync(abs(path.join(dirT14r, 'p2.ts'))),
        reg2Text.slice(0, 200),
      );
    }

    // ════════════════════════════════════════════════════════════════════
    // TOOLDEV15 — LOC-TARGET-DRIVEN god-class auto-plan: ONE
    // atomic_decompose_file is SIZED to land at the MEASURED "TARGET MET"
    // (no PROGRESS tail → no create_file/replace_text hand-roll).
    // ════════════════════════════════════════════════════════════════════
    const mkMethod = (name: string, body: number): string => {
      const ls = [`  ${name}(n: number): number {`, '    let s = n;'];
      for (let i = 0; i < body; i++) ls.push(`    s += ${i};`);
      ls.push('    return s;', '  }');
      return ls.join('\n');
    };
    // (m) a god-class big enough that naive concern-grouping would NOT reach
    //     the target, but the LOC-target plan extracts enough of the LARGEST
    //     methods that the PREDICTED and REAL origin ≤ 350 → ONE decompose
    //     self-certifies TARGET MET; origin ≤ 350; modules ≤ 400; class
    //     public API byte-stable; all parse; the split was a SIZED SUBSET
    //     (not full-collapse — sizing actually kicked in).
    {
      const dirM = path.join(tmpRel, 'tooldev15-m');
      fs.mkdirSync(abs(dirM), { recursive: true });
      const mRel = path.join(dirM, 'order-engine.service.ts');
      const big = ['processAlpha', 'processBeta', 'processGamma', 'processDelta'];
      const small = ['t1', 't2', 't3', 't4', 't5', 't6'];
      fs.writeFileSync(
        abs(mRel),
        [
          'export class OrderEngine {',
          ...big.map((nm) => mkMethod(nm, 120)),
          ...small.map((nm) => mkMethod(nm, 1)),
          '}',
          'export const ORDER_CAP = 9;',
          '',
        ].join('\n'),
      );
      const mBefore = fs.readFileSync(abs(mRel), 'utf8');
      const mMethodsBefore = new Set(
        (await outline(mRel, mBefore)).symbols
          .filter((sym) => sym.kind === 'MethodDeclaration')
          .map((sym) => sym.selector),
      );
      const totalMethods = mMethodsBefore.size; // 10
      await client.callTool({ name: 'code_outline', arguments: { file: mRel } });
      const mRaw = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirM, 'order-engine.helpers.ts'),
          content: 'export const x = 1;\n',
        },
      })) as { content: { text: string }[] };
      const mText = mRaw.content.map((c) => c.text ?? '').join('\n');
      let mBody: {
        ok?: boolean;
        changed?: boolean;
        modules?: { module: string; symbols: string[] }[];
        completionVerdict?: { met?: boolean; originLoc?: number };
      } = {};
      try {
        mBody = JSON.parse(mRaw.content.at(-1)?.text ?? '{}');
      } catch {
        mBody = {};
      }
      const mMods = Array.isArray(mBody.modules) ? mBody.modules : [];
      const mPlanSyms = mMods.flatMap((g) => g.symbols);
      const mAfter = fs.readFileSync(abs(mRel), 'utf8');
      const mOriginLoc = locOf(mAfter);
      let mModsParse = mMods.length >= 1;
      let mMaxMod = 0;
      for (const g of mMods) {
        if (!fs.existsSync(abs(g.module))) {
          mModsParse = false;
          break;
        }
        const gt = fs.readFileSync(abs(g.module), 'utf8');
        if ((await outline(g.module, gt)).language !== 'ts') {
          mModsParse = false;
          break;
        }
        mMaxMod = Math.max(mMaxMod, locOf(gt));
      }
      const mMethodsAfter = new Set(
        (await outline(mRel, mAfter)).symbols
          .filter((sym) => sym.kind === 'MethodDeclaration')
          .map((sym) => sym.selector),
      );
      const apiStable =
        mMethodsAfter.size === mMethodsBefore.size &&
        [...mMethodsBefore].every((s) => mMethodsAfter.has(s));
      check(
        'TOOLDEV15 (m): over-target god-class — ONE sized decompose self-certifies TARGET MET (origin ≤ 350, modules ≤ 400, API byte-stable, SIZED subset)',
        mBody.ok === true &&
          mBody.changed === true &&
          mText.includes('AUTO-EXECUTED') &&
          mText.includes('TARGET MET') &&
          mBody.completionVerdict?.met === true &&
          mOriginLoc <= 350 &&
          mModsParse &&
          mMaxMod <= 400 &&
          apiStable &&
          mPlanSyms.length >= 2 &&
          mPlanSyms.length < totalMethods &&
          mPlanSyms.every((s) => s.startsWith('OrderEngine.')),
        JSON.stringify({
          ok: mBody.ok,
          met: mBody.completionVerdict?.met,
          originLoc: mOriginLoc,
          maxMod: mMaxMod,
          planSyms: mPlanSyms.length,
          totalMethods,
          apiStable,
        }),
      );
    }
    // (n) concern is still respected as a tiebreak: when size allows,
    //     methods sharing a name-concern land in the SAME module.
    {
      const dirN = path.join(tmpRel, 'tooldev15-n');
      fs.mkdirSync(abs(dirN), { recursive: true });
      const nRel = path.join(dirN, 'doc-parser.service.ts');
      fs.writeFileSync(
        abs(nRel),
        [
          'export class DocParser {',
          ...['parseHeader', 'parseBody', 'parseFooter'].map((nm) =>
            mkMethod(nm, 1),
          ),
          ...['emitJson', 'emitXml'].map((nm) => mkMethod(nm, 1)),
          mkMethod('validateAll', 1),
          '}',
          'export const PARSER_V = 1;',
          '',
        ].join('\n'),
      );
      await client.callTool({ name: 'code_outline', arguments: { file: nRel } });
      const nRaw = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirN, 'doc-parser.helpers.ts'),
          content: 'export const x = 1;\n',
        },
      })) as { content: { text: string }[] };
      const nText = nRaw.content.map((c) => c.text ?? '').join('\n');
      let nBody: {
        ok?: boolean;
        modules?: { module: string; symbols: string[] }[];
        completionVerdict?: { met?: boolean };
      } = {};
      try {
        nBody = JSON.parse(nRaw.content.at(-1)?.text ?? '{}');
      } catch {
        nBody = {};
      }
      const nMods = Array.isArray(nBody.modules) ? nBody.modules : [];
      const concernHead = (sel: string): string => {
        const bare = sel.split('.').pop() ?? sel;
        return (bare.match(/^[a-z]+/)?.[0] ?? bare).toLowerCase();
      };
      // at least one produced module groups ≥2 methods that all share a
      // single name-concern (here: the 3 parse* methods stayed together).
      const cohesiveModule = nMods.some(
        (g) =>
          g.symbols.length >= 2 &&
          new Set(g.symbols.map(concernHead)).size === 1,
      );
      const parseGrouped = nMods.some(
        (g) =>
          g.symbols.filter((s) => s.includes('.parse')).length >= 2 &&
          g.symbols.every((s) => s.includes('.parse')),
      );
      check(
        'TOOLDEV15 (n): concern cohesion preserved as tiebreak — a multi-method concern stays grouped in one module (TARGET MET)',
        nBody.ok === true &&
          nText.includes('TARGET MET') &&
          nBody.completionVerdict?.met === true &&
          nMods.length >= 2 &&
          cohesiveModule &&
          parseGrouped,
        JSON.stringify(nMods.map((g) => g.symbols)),
      );
    }
    // (o) REGRESSION: a genuinely top-level-symbol file still produces the
    //     SAME shape of plan as before (bare no-dot selectors, ≥3 modules,
    //     concern-grouped); a 2nd decompose still HARD-STOPS (idempotency);
    //     and a class-method extraction is still behavior-preserving
    //     (delegating stub + byte-stable class signature).
    {
      const dirO = path.join(tmpRel, 'tooldev15-o');
      fs.mkdirSync(abs(dirO), { recursive: true });
      const oRel = path.join(dirO, 'inventory.toolkit.ts');
      fs.writeFileSync(
        abs(oRel),
        [
          'export function createItem(): string { return "c"; }',
          'export function cancelItem(): string { return "x"; }',
          'export function listItems(): string { return "l"; }',
          'export function shipItem(): string { return "s"; }',
          'export function trackItem(): string { return "t"; }',
          'export const ITEM_CAP = 7;',
          '',
        ].join('\n'),
      );
      const oTop = new Set(
        (await outline(oRel, fs.readFileSync(abs(oRel), 'utf8'))).symbols
          .map((sym) => sym.selector)
          .filter((sel) => !sel.includes('.')),
      );
      await client.callTool({ name: 'code_outline', arguments: { file: oRel } });
      const oRaw = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirO, 'inventory.helpers.ts'),
          content: 'export const z = 1;\n',
        },
      })) as { content: { text: string }[] };
      let oBody: {
        ok?: boolean;
        modules?: { module: string; symbols: string[] }[];
      } = {};
      try {
        oBody = JSON.parse(oRaw.content.at(-1)?.text ?? '{}');
      } catch {
        oBody = {};
      }
      const oMods = Array.isArray(oBody.modules) ? oBody.modules : [];
      const oSyms = oMods.flatMap((g) => g.symbols);
      // 2nd decomposition trigger on the SAME top-level origin → HARD-STOP.
      const o2Raw = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirO, 'inventory.more.ts'),
          content: 'export const w = 2;\n',
        },
      })) as { content: { text: string }[] };
      const o2Text = o2Raw.content.map((c) => c.text ?? '').join('\n');
      let o2Body: { ok?: boolean; changed?: boolean } = {};
      try {
        o2Body = JSON.parse(o2Raw.content.at(-1)?.text ?? '{}');
      } catch {
        o2Body = {};
      }
      check(
        'TOOLDEV15 (o): regression — top-level file SAME plan shape (bare selectors, ≥3 modules) + 2nd decompose HARD-STOPS (idempotency intact)',
        oBody.ok === true &&
          oMods.length >= 3 &&
          oSyms.length >= 3 &&
          oSyms.every((s) => !s.includes('.') && oTop.has(s)) &&
          /ALREADY decomposed/i.test(o2Text) &&
          o2Body.ok !== true &&
          o2Body.changed !== true &&
          !fs.existsSync(abs(path.join(dirO, 'inventory.more.ts'))),
        JSON.stringify({ oSyms, o2: o2Text.slice(0, 120) }),
      );
      // class-method extraction still behavior-preserving: delegating stub
      // kept in the origin, class method signature byte-stable.
      const dirO2 = path.join(tmpRel, 'tooldev15-o-cls');
      fs.mkdirSync(abs(dirO2), { recursive: true });
      const cRel = path.join(dirO2, 'mini-agent.service.ts');
      fs.writeFileSync(
        abs(cRel),
        [
          'export class MiniAgent {',
          '  base = 2;',
          '  handleA(n: number): number { return n + this.base; }',
          '  handleB(n: number): number { return n - this.base; }',
          '  loadX(id: string): string { return `x:${id}`; }',
          '  loadY(id: string): string { return `y:${id}`; }',
          '  buildZ(): string { return `z:${this.base}`; }',
          '}',
          'export const MINI_V = 1;',
          '',
        ].join('\n'),
      );
      await client.callTool({ name: 'code_outline', arguments: { file: cRel } });
      const cRaw = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirO2, 'mini-agent.helpers.ts'),
          content: 'export const x = 1;\n',
        },
      })) as { content: { text: string }[] };
      let cBody: { ok?: boolean; completionVerdict?: { met?: boolean } } = {};
      try {
        cBody = JSON.parse(cRaw.content.at(-1)?.text ?? '{}');
      } catch {
        cBody = {};
      }
      const cAfter = fs.readFileSync(abs(cRel), 'utf8');
      check(
        'TOOLDEV15 (o): regression — class-method extraction still behavior-preserving (delegating stub + byte-stable signature, TARGET MET)',
        cBody.ok === true &&
          cBody.completionVerdict?.met === true &&
          /class MiniAgent/.test(cAfter) &&
          /\bhandleA\(n: number\): number\b/.test(cAfter) &&
          /\bbuildZ\(\): string\b/.test(cAfter) &&
          /return handleA\(/.test(cAfter) &&
          /return buildZ\(/.test(cAfter),
        cAfter.slice(0, 300),
      );
    }
    // ════════════════════════════════════════════════════════════════════
    // TOOLDEV16 — EXTRACTABILITY-AWARE god-class planner. The planner now
    // DISCOVERS which methods the engine will actually accept (the SAME
    // read-only predicate the tooldev12 guard runs) and never proposes one
    // the all-or-nothing decompose would refuse (the R27 abort cause).
    // ════════════════════════════════════════════════════════════════════
    // (p) a god-class mixing LARGE private-accessing methods (#secret) with
    //     LARGE clean methods. Naive largest-first would pick the private
    //     ones FIRST and the decompose would ABORT. The planner must select
    //     ONLY safely-extractable methods, ONE decompose SUCCEEDS (no abort),
    //     origin parses, class public API byte-stable, verdict is an honest
    //     TARGET MET or PROGRESS (never a refused transaction).
    {
      const dirP = path.join(tmpRel, 'tooldev16-p');
      fs.mkdirSync(abs(dirP), { recursive: true });
      const pRel = path.join(dirP, 'secret-engine.service.ts');
      const mkPriv = (name: string, body: number): string => {
        const ls = [`  ${name}(n: number): number {`, '    let s = n;'];
        for (let i = 0; i < body; i++) ls.push(`    s += ${i};`);
        ls.push('    return s + this.#secret;', '  }');
        return ls.join('\n');
      };
      const priv = ['pAlpha', 'pBeta', 'pGamma', 'pDelta'];
      const clean = ['cAlpha', 'cBeta', 'cGamma', 'cDelta'];
      const small = ['t1', 't2', 't3', 't4'];
      fs.writeFileSync(
        abs(pRel),
        [
          'export class SecretEngine {',
          '  #secret = 42;',
          ...priv.map((nm) => mkPriv(nm, 160)),
          ...clean.map((nm) => mkMethod(nm, 130)),
          ...small.map((nm) => mkMethod(nm, 1)),
          '}',
          'export const SE_CAP = 9;',
          '',
        ].join('\n'),
      );
      const pBefore = fs.readFileSync(abs(pRel), 'utf8');
      const pMethodsBefore = new Set(
        (await outline(pRel, pBefore)).symbols
          .filter((sym) => sym.kind === 'MethodDeclaration')
          .map((sym) => sym.selector),
      );
      const privSel = new Set(priv.map((nm) => `SecretEngine.${nm}`));
      await client.callTool({ name: 'code_outline', arguments: { file: pRel } });
      const pRaw = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirP, 'secret-engine.helpers.ts'),
          content: 'export const x = 1;\n',
        },
      })) as { content: { text: string }[] };
      const pText = pRaw.content.map((c) => c.text ?? '').join('\n');
      let pBody: {
        ok?: boolean;
        changed?: boolean;
        modules?: { module: string; symbols: string[] }[];
        completionVerdict?: { met?: boolean };
      } = {};
      try {
        pBody = JSON.parse(pRaw.content.at(-1)?.text ?? '{}');
      } catch {
        pBody = {};
      }
      const pMods = Array.isArray(pBody.modules) ? pBody.modules : [];
      const pPlanSyms = pMods.flatMap((g) => g.symbols);
      const pAfter = fs.readFileSync(abs(pRel), 'utf8');
      let pModsParse = pMods.length >= 1;
      for (const g of pMods) {
        if (!fs.existsSync(abs(g.module))) {
          pModsParse = false;
          break;
        }
        if ((await outline(g.module, fs.readFileSync(abs(g.module), 'utf8'))).language !== 'ts') {
          pModsParse = false;
          break;
        }
      }
      const pMethodsAfter = new Set(
        (await outline(pRel, pAfter)).symbols
          .filter((sym) => sym.kind === 'MethodDeclaration')
          .map((sym) => sym.selector),
      );
      const pApiStable =
        pMethodsAfter.size === pMethodsBefore.size &&
        [...pMethodsBefore].every((s) => pMethodsAfter.has(s));
      const pOriginParses =
        (await outline(pRel, pAfter)).language === 'ts';
      // A/B TOOLDEV19: an honest verdict is TARGET MET or the terminal
      // floor-bound "MINIMALLY DECOMPOSED" (the ▶ PROGRESS verdict is gone).
      const pVerdictHonest =
        pBody.completionVerdict?.met === true ||
        /MINIMALLY DECOMPOSED/.test(pText);
      check(
        'TOOLDEV16 (p): planner selects ONLY safely-extractable methods (no #secret accessors) — ONE decompose SUCCEEDS, no abort, API byte-stable, honest verdict',
        pBody.ok === true &&
          pBody.changed === true &&
          pText.includes('AUTO-EXECUTED') &&
          !/cannot safely extract/.test(pText) &&
          !/ALREADY decomposed/i.test(pText) &&
          pPlanSyms.length >= 2 &&
          pPlanSyms.every((s) => s.startsWith('SecretEngine.')) &&
          pPlanSyms.every((s) => !privSel.has(s)) &&
          pModsParse &&
          pOriginParses &&
          pApiStable &&
          pVerdictHonest,
        JSON.stringify({
          ok: pBody.ok,
          changed: pBody.changed,
          met: pBody.completionVerdict?.met,
          planSyms: pPlanSyms,
          apiStable: pApiStable,
          parses: pOriginParses,
          text: pText.slice(0, 140),
        }),
      );
    }
    // (q) the PURE predicate itself + guard agreement. canExtractClassMethod
    //     refuses a private-accessing method and a generator (with a reason),
    //     accepts a clean this-free method and a this-only-PUBLIC method —
    //     and the REAL relocation path (moveSymbolToFile) refuses the SAME
    //     unsafe method (one shared code path: analyzeClassMethodExtraction).
    {
      const qRel = 'mx/q-source.ts';
      const qText = [
        'export class Svc {',
        '  private secret = 7;',
        '  count = 0;',
        '  reveal(): number { return this.secret + 1; }',
        '  *tick(): Generator<number> { yield 1; }',
        '  pure(n: number): number { return n + 1; }',
        '  pub(): number { return this.count + 2; }',
        '}',
        '',
      ].join('\n');
      const vReveal = await canExtractClassMethod(qRel, qText, 'Svc.reveal');
      const vGen = await canExtractClassMethod(qRel, qText, 'Svc.tick');
      const vPure = await canExtractClassMethod(qRel, qText, 'Svc.pure');
      const vPub = await canExtractClassMethod(qRel, qText, 'Svc.pub');
      // REAL path on the SAME unsafe method → must also refuse (same logic).
      let realThrew = false;
      let realMsg = '';
      try {
        await moveSymbolToFile({
          fromRel: qRel,
          fromBefore: qText,
          toRel: 'mx/q-other.ts',
          toBefore: '',
          toExists: false,
          selector: 'Svc.reveal',
          leaveReExport: true,
        });
      } catch (e) {
        realThrew = true;
        realMsg = e instanceof Error ? e.message : String(e);
      }
      check(
        'TOOLDEV16 (q): pure predicate refuses private+generator (with reason), accepts clean+this-only-public; REAL path refuses the SAME private method (guard ≡ predicate)',
        vReveal.ok === false &&
          /private\/protected member\(s\) \[secret\]/.test(vReveal.reason) &&
          vGen.ok === false &&
          /generator/.test(vGen.reason) &&
          vPure.ok === true &&
          vPub.ok === true &&
          realThrew &&
          /private\/protected member\(s\) \[secret\]/.test(realMsg),
        JSON.stringify({
          reveal: vReveal,
          gen: vGen.ok === false ? vGen.reason.slice(0, 60) : vGen,
          pure: vPure,
          pub: vPub,
          realMsg: realMsg.slice(0, 100),
        }),
      );
    }
    // (r) REGRESSION: a genuine top-level decompose is unchanged AND a 2nd
    //     decompose of the same origin still HARD-STOPS (idempotency); a
    //     clean class-method extraction is still behavior-preserving.
    {
      const dirR = path.join(tmpRel, 'tooldev16-r');
      fs.mkdirSync(abs(dirR), { recursive: true });
      const rRel = path.join(dirR, 'plain.ts');
      fs.writeFileSync(
        abs(rRel),
        [
          'export function ra(): number { return 1; }',
          'export function rb(): number { return 2; }',
          'export function rc(): number { return 3; }',
          '',
        ].join('\n'),
      );
      const r1 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: rRel,
          plan: [
            { symbols: ['ra', 'rb'], newModule: path.join(dirR, 'r1.ts') },
            { symbols: ['rc'], newModule: path.join(dirR, 'r2.ts') },
          ],
        },
      })) as { content: { text: string }[] };
      const r1Body = JSON.parse(r1.content.at(-1)?.text ?? '{}');
      const r2 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: rRel,
          plan: [{ symbols: ['ra'], newModule: path.join(dirR, 'r3.ts') }],
        },
      })) as { content: { text: string }[] };
      const r2Text = r2.content.map((c) => c.text ?? '').join('\n');
      const r2Body = JSON.parse(r2.content.at(-1)?.text ?? '{}');
      // clean class-method extraction unchanged (delegation + byte-stable).
      const rClean = await moveSymbolToFile({
        fromRel: 'mx/r-src.ts',
        fromBefore: [
          'export class Calc {',
          '  base = 3;',
          '  addPub(n: number): number { return n + this.base; }',
          '  pureZ(n: number): number { return n * 2; }',
          '}',
          '',
        ].join('\n'),
        toRel: 'mx/r-helpers.ts',
        toBefore: '',
        toExists: false,
        selector: 'Calc.pureZ',
        leaveReExport: true,
      });
      check(
        'TOOLDEV16 (r): regression — top-level decompose unchanged + 2nd HARD-STOPS + clean class-method extraction still behavior-preserving',
        r1Body.ok === true &&
          r1Body.changed === true &&
          r2Body.ok !== true &&
          /ALREADY decomposed/i.test(r2Text) &&
          !fs.existsSync(abs(path.join(dirR, 'r3.ts'))) &&
          /export function pureZ/.test(rClean.to.after) &&
          /return pureZ\(/.test(rClean.from.after) &&
          /pureZ\(n: number\): number/.test(rClean.from.after) &&
          rClean.from.validation.ok &&
          rClean.to.validation.ok,
        JSON.stringify({
          r1: r1Body.ok,
          r2: r2Text.slice(0, 80),
          from: rClean.from.after.slice(0, 160),
        }),
      );
    }
    // ════════════════════════════════════════════════════════════════════
    // TOOLDEV17 — MINIMAL & FLOOR-BOUNDED god-class plan. R28 regressed
    // because the LOC-target planner OVER-extracted (737-LOC class → 9-line
    // husk = MAXIMAL mutation, churn 1289→1617 — the exact opposite of
    // Preservação Máxima). The planner now selects the MINIMAL largest-first
    // prefix that clears the band and NEVER guts below ORIGIN_FLOOR ("just
    // under target", NOT "as small as possible").
    // ════════════════════════════════════════════════════════════════════
    // (s) a god-class so large a naive "extract all extractable" sweep would
    //     gut origin FAR below the floor → planner selects only a MINIMAL
    //     subset; REAL post-decompose origin lands in [floor,350] (NOT a
    //     husk); class API byte-stable; ONE decompose; verdict TARGET MET.
    {
      const dirS = path.join(tmpRel, 'tooldev17-s');
      fs.mkdirSync(abs(dirS), { recursive: true });
      const sRel = path.join(dirS, 'mega-engine.service.ts');
      const sBig = Array.from({ length: 8 }, (_v, i) => `big${i}`);
      const sSmall = ['q1', 'q2', 'q3', 'q4'];
      fs.writeFileSync(
        abs(sRel),
        [
          'export class MegaEngine {',
          ...sBig.map((nm) => mkMethod(nm, 50)),
          ...sSmall.map((nm) => mkMethod(nm, 1)),
          '}',
          'export const MEGA_CAP = 9;',
          '',
        ].join('\n'),
      );
      const sBefore = fs.readFileSync(abs(sRel), 'utf8');
      const sOriginLoc = locOf(sBefore);
      const sFloor = Math.max(180, Math.round(0.35 * sOriginLoc));
      const sMethodsBefore = new Set(
        (await outline(sRel, sBefore)).symbols
          .filter((sym) => sym.kind === 'MethodDeclaration')
          .map((sym) => sym.selector),
      );
      const sTotal = sMethodsBefore.size;
      await client.callTool({ name: 'code_outline', arguments: { file: sRel } });
      const sRaw = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirS, 'mega-engine.helpers.ts'),
          content: 'export const x = 1;\n',
        },
      })) as { content: { text: string }[] };
      const sText = sRaw.content.map((c) => c.text ?? '').join('\n');
      let sBody: {
        ok?: boolean;
        changed?: boolean;
        modules?: { module: string; symbols: string[] }[];
        completionVerdict?: { met?: boolean };
      } = {};
      try {
        sBody = JSON.parse(sRaw.content.at(-1)?.text ?? '{}');
      } catch {
        sBody = {};
      }
      const sMods = Array.isArray(sBody.modules) ? sBody.modules : [];
      const sPlan = sMods.flatMap((g) => g.symbols);
      const sAfter = fs.readFileSync(abs(sRel), 'utf8');
      const sOriginAfter = locOf(sAfter);
      let sModsParse = sMods.length >= 1;
      let sMaxMod = 0;
      for (const g of sMods) {
        if (!fs.existsSync(abs(g.module))) {
          sModsParse = false;
          break;
        }
        const gt = fs.readFileSync(abs(g.module), 'utf8');
        if ((await outline(g.module, gt)).language !== 'ts') {
          sModsParse = false;
          break;
        }
        sMaxMod = Math.max(sMaxMod, locOf(gt));
      }
      const sMethodsAfter = new Set(
        (await outline(sRel, sAfter)).symbols
          .filter((sym) => sym.kind === 'MethodDeclaration')
          .map((sym) => sym.selector),
      );
      const sApiStable =
        sMethodsAfter.size === sMethodsBefore.size &&
        [...sMethodsBefore].every((x) => sMethodsAfter.has(x));
      const s2Raw = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirS, 'mega-engine.more.ts'),
          content: 'export const y = 2;\n',
        },
      })) as { content: { text: string }[] };
      const s2Text = s2Raw.content.map((c) => c.text ?? '').join('\n');
      check(
        'TOOLDEV17 (s): over-huge god-class — MINIMAL subset (NOT husk), real origin in [floor,350], API byte-stable, ONE decompose, TARGET MET',
        sBody.ok === true &&
          sBody.changed === true &&
          sText.includes('AUTO-EXECUTED') &&
          sText.includes('TARGET MET') &&
          sBody.completionVerdict?.met === true &&
          sOriginAfter >= sFloor &&
          sOriginAfter <= 350 &&
          sPlan.length >= 2 &&
          sPlan.length < sTotal &&
          sPlan.every((x) => x.startsWith('MegaEngine.')) &&
          sModsParse &&
          sMaxMod <= 400 &&
          sApiStable &&
          /ALREADY decomposed/i.test(s2Text),
        JSON.stringify({
          originLoc: sOriginLoc,
          floor: sFloor,
          originAfter: sOriginAfter,
          plan: sPlan.length,
          total: sTotal,
          maxMod: sMaxMod,
          apiStable: sApiStable,
          met: sBody.completionVerdict?.met,
        }),
      );
    }
    // (t) a god-class where even the minimal sufficient prefix would dip
    //     UNDER the floor (one MONSTER method alone undershoots; only tiny
    //     others) → planner refuses to gut the monster, extracts the small
    //     floor-safe set, monster PRESERVED, verdict honest PROGRESS,
    //     origin ≥ floor, NO over-extraction.
    {
      const dirT = path.join(tmpRel, 'tooldev17-t');
      fs.mkdirSync(abs(dirT), { recursive: true });
      const tRel = path.join(dirT, 'monster.service.ts');
      const tTiny = ['ta', 'tb', 'tc', 'td', 'te', 'tf'];
      fs.writeFileSync(
        abs(tRel),
        [
          'export class MonsterSvc {',
          mkMethod('megaCompute', 500),
          ...tTiny.map((nm) => mkMethod(nm, 1)),
          '}',
          'export const MON_CAP = 9;',
          '',
        ].join('\n'),
      );
      const tBefore = fs.readFileSync(abs(tRel), 'utf8');
      const tOriginLoc = locOf(tBefore);
      const tFloor = Math.max(180, Math.round(0.35 * tOriginLoc));
      await client.callTool({ name: 'code_outline', arguments: { file: tRel } });
      const tRaw = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirT, 'monster.helpers.ts'),
          content: 'export const x = 1;\n',
        },
      })) as { content: { text: string }[] };
      const tText = tRaw.content.map((c) => c.text ?? '').join('\n');
      let tBody: {
        ok?: boolean;
        changed?: boolean;
        modules?: { module: string; symbols: string[] }[];
        completionVerdict?: { met?: boolean };
      } = {};
      try {
        tBody = JSON.parse(tRaw.content.at(-1)?.text ?? '{}');
      } catch {
        tBody = {};
      }
      const tMods = Array.isArray(tBody.modules) ? tBody.modules : [];
      const tPlan = tMods.flatMap((g) => g.symbols);
      const tAfter = fs.readFileSync(abs(tRel), 'utf8');
      const tOriginAfter = locOf(tAfter);
      const tMet = tBody.completionVerdict?.met === true;
      // A/B TOOLDEV19: floor-bound is now the terminal "MINIMALLY
      // DECOMPOSED" verdict (the ▶ PROGRESS "do one more pass" is removed).
      const tHonest =
        (tMet && tOriginAfter <= 350) ||
        (!tMet && /MINIMALLY DECOMPOSED/.test(tText) && tOriginAfter > 350);
      check(
        "TOOLDEV17 (t): monster-only god-class — planner WON'T gut the monster, picks floor-safe subset, honest verdict, origin ≥ floor, no over-extraction",
        tBody.ok === true &&
          tBody.changed === true &&
          tText.includes('AUTO-EXECUTED') &&
          tHonest &&
          tOriginAfter >= tFloor &&
          /\bmegaCompute\(/.test(tAfter) &&
          tPlan.length >= 2 &&
          !tPlan.includes('MonsterSvc.megaCompute') &&
          tPlan.every((x) => x.startsWith('MonsterSvc.')),
        JSON.stringify({
          originLoc: tOriginLoc,
          floor: tFloor,
          originAfter: tOriginAfter,
          plan: tPlan,
          met: tMet,
        }),
      );
    }
    // (u) regression: a god-class needing only ~2 method extractions to
    //     clear the target → EXACTLY that minimal set is chosen (NOT all);
    //     origin lands comfortably within the band; small/unsafe methods
    //     preserved in place.
    {
      const dirU = path.join(tmpRel, 'tooldev17-u');
      fs.mkdirSync(abs(dirU), { recursive: true });
      const uRel = path.join(dirU, 'two-method.service.ts');
      const mkPriv = (name: string, body: number): string => {
        const ls = [`  ${name}(n: number): number {`, '    let s = n;'];
        for (let i = 0; i < body; i++) ls.push(`    s += ${i};`);
        ls.push('    return s + this.#k;', '  }');
        return ls.join('\n');
      };
      fs.writeFileSync(
        abs(uRel),
        [
          'export class TwoMethodSvc {',
          '  #k = 1;',
          mkMethod('bigOne', 199),
          mkMethod('bigTwo', 199),
          mkPriv('privPad', 280),
          ...['u1', 'u2', 'u3'].map((nm) => mkMethod(nm, 1)),
          '}',
          'export const TM_CAP = 9;',
          '',
        ].join('\n'),
      );
      const uBefore = fs.readFileSync(abs(uRel), 'utf8');
      const uOriginLoc = locOf(uBefore);
      const uFloor = Math.max(180, Math.round(0.35 * uOriginLoc));
      const uMethodsBefore = new Set(
        (await outline(uRel, uBefore)).symbols
          .filter((sym) => sym.kind === 'MethodDeclaration')
          .map((sym) => sym.selector),
      );
      await client.callTool({ name: 'code_outline', arguments: { file: uRel } });
      const uRaw = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirU, 'two-method.helpers.ts'),
          content: 'export const x = 1;\n',
        },
      })) as { content: { text: string }[] };
      const uText = uRaw.content.map((c) => c.text ?? '').join('\n');
      let uBody: {
        ok?: boolean;
        modules?: { module: string; symbols: string[] }[];
        completionVerdict?: { met?: boolean };
      } = {};
      try {
        uBody = JSON.parse(uRaw.content.at(-1)?.text ?? '{}');
      } catch {
        uBody = {};
      }
      const uMods = Array.isArray(uBody.modules) ? uBody.modules : [];
      const uPlan = uMods.flatMap((g) => g.symbols);
      const uAfter = fs.readFileSync(abs(uRel), 'utf8');
      const uOriginAfter = locOf(uAfter);
      const uMethodsAfter = new Set(
        (await outline(uRel, uAfter)).symbols
          .filter((sym) => sym.kind === 'MethodDeclaration')
          .map((sym) => sym.selector),
      );
      const uApiStable =
        uMethodsAfter.size === uMethodsBefore.size &&
        [...uMethodsBefore].every((x) => uMethodsAfter.has(x));
      check(
        'TOOLDEV17 (u): regression — only ~2 extractions needed → EXACTLY that minimal set chosen (not all), origin within band, unsafe/small preserved',
        uBody.ok === true &&
          uText.includes('TARGET MET') &&
          uBody.completionVerdict?.met === true &&
          uPlan.length === 2 &&
          uPlan.every((x) =>
            ['TwoMethodSvc.bigOne', 'TwoMethodSvc.bigTwo'].includes(x),
          ) &&
          uOriginAfter >= uFloor &&
          uOriginAfter <= 350 &&
          !uPlan.includes('TwoMethodSvc.privPad') &&
          /\bprivPad\(/.test(uAfter) &&
          /\bu1\(/.test(uAfter) &&
          uApiStable,
        JSON.stringify({
          originLoc: uOriginLoc,
          floor: uFloor,
          originAfter: uOriginAfter,
          plan: uPlan,
        }),
      );
    }
    // (v) regression: top-level decompose unchanged + idempotency HARD-STOP
    //     + clean class-method extraction behavior-preserving + the
    //     canExtractClassMethod gate still refuses unsafe methods.
    {
      const dirV = path.join(tmpRel, 'tooldev17-v');
      fs.mkdirSync(abs(dirV), { recursive: true });
      const vRel = path.join(dirV, 'plain17.ts');
      fs.writeFileSync(
        abs(vRel),
        [
          'export function va(): number { return 1; }',
          'export function vb(): number { return 2; }',
          'export function vc(): number { return 3; }',
          '',
        ].join('\n'),
      );
      const v1 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: vRel,
          plan: [
            { symbols: ['va', 'vb'], newModule: path.join(dirV, 'v1.ts') },
            { symbols: ['vc'], newModule: path.join(dirV, 'v2.ts') },
          ],
        },
      })) as { content: { text: string }[] };
      const v1Body = JSON.parse(v1.content.at(-1)?.text ?? '{}');
      const v2 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: vRel,
          plan: [{ symbols: ['va'], newModule: path.join(dirV, 'v3.ts') }],
        },
      })) as { content: { text: string }[] };
      const v2Text = v2.content.map((c) => c.text ?? '').join('\n');
      const v2Body = JSON.parse(v2.content.at(-1)?.text ?? '{}');
      const vClean = await moveSymbolToFile({
        fromRel: 'mx/v-src.ts',
        fromBefore: [
          'export class VCalc {',
          '  base = 3;',
          '  addPub(n: number): number { return n + this.base; }',
          '  pureV(n: number): number { return n * 2; }',
          '}',
          '',
        ].join('\n'),
        toRel: 'mx/v-helpers.ts',
        toBefore: '',
        toExists: false,
        selector: 'VCalc.pureV',
        leaveReExport: true,
      });
      const vGateSrc = [
        'export class VGate {',
        '  #sek = 7;',
        '  leak(): number { return this.#sek + 1; }',
        '  clean(n: number): number { return n + 1; }',
        '}',
        '',
      ].join('\n');
      const vGatePriv = await canExtractClassMethod(
        'mx/v-gate.ts',
        vGateSrc,
        'VGate.leak',
      );
      const vGateClean = await canExtractClassMethod(
        'mx/v-gate.ts',
        vGateSrc,
        'VGate.clean',
      );
      check(
        'TOOLDEV17 (v): regression — top-level decompose unchanged + 2nd HARD-STOPS + clean class-method extraction preserving + gate refuses unsafe',
        v1Body.ok === true &&
          v1Body.changed === true &&
          v2Body.ok !== true &&
          /ALREADY decomposed/i.test(v2Text) &&
          !fs.existsSync(abs(path.join(dirV, 'v3.ts'))) &&
          /export function pureV/.test(vClean.to.after) &&
          /return pureV\(/.test(vClean.from.after) &&
          /pureV\(n: number\): number/.test(vClean.from.after) &&
          vClean.from.validation.ok &&
          vClean.to.validation.ok &&
          vGatePriv.ok === false &&
          vGateClean.ok === true,
        JSON.stringify({
          v1: v1Body.ok,
          v2: v2Text.slice(0, 80),
          gatePriv: vGatePriv.ok,
          gateClean: vGateClean.ok,
        }),
      );
    }

    // ════════════════════════════════════════════════════════════════════
    // TOOLDEV19 — STRUCTURAL COLLAPSE: idempotent BY CONSTRUCTION. One
    // god-class decompose is ONE internally-convergent all-or-nothing
    // transaction that ends at TARGET MET or at the FROZEN ABSOLUTE_FLOOR
    // (the maximal safe reduction). BOTH are terminal end states, so the
    // origin is recorded done UNCONDITIONALLY and ANY subsequent decompose /
    // create_file-trigger HARD-STOPS ⛔. The tooldev18 multi-pass /
    // progress-counter / cap-4 / "do one more pass" tangle is structurally
    // GONE (not tuned) — there is no 2nd pass for it to bound, so it cannot
    // oscillate. (w) below was the tooldev18 "PROGRESS → 2nd pass allowed →
    // TARGET MET → ⛔" sequence; under tooldev19 the FIRST converged call is
    // ALREADY terminal, so the SECOND call ⛔ immediately (asserted here).
    // The deleted tooldev18 (y) cap test no longer applies (no multi-pass).
    // ════════════════════════════════════════════════════════════════════
    // (w) A/B TOOLDEV19 ADJUSTED: a huge god-class, ONE manual
    //     atomic_decompose_file subset that leaves origin > 350 (floor-bound)
    //     → ok, terminal "MINIMALLY DECOMPOSED", NOT ⛔, recorded done. The
    //     SECOND atomic_decompose_file on the SAME origin HARD-STOPS ⛔
    //     (terminal — NO "another pass"); a create_file-decomposition-trigger
    //     ALSO ⛔. (Was tooldev18's 3-pass monotonic-reduction sequence.)
    {
      const dirW = path.join(tmpRel, 'tooldev18-w');
      fs.mkdirSync(abs(dirW), { recursive: true });
      const wRel = path.join(dirW, 'unified-agent.service.ts');
      const wBig = Array.from({ length: 12 }, (_v, i) => `big${i}`);
      fs.writeFileSync(
        abs(wRel),
        [
          'export class UnifiedAgentService {',
          ...wBig.map((nm) => mkMethod(nm, 80)),
          '}',
          'export const W_CAP = 9;',
          '',
        ].join('\n'),
      );
      // PASS 1 — manual subset; origin stays > 350 → terminal floor-bound.
      const w1 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: wRel,
          plan: [
            {
              symbols: ['UnifiedAgentService.big0', 'UnifiedAgentService.big1', 'UnifiedAgentService.big2'],
              newModule: path.join(dirW, 'w-a.ts'),
            },
            {
              symbols: ['UnifiedAgentService.big3', 'UnifiedAgentService.big4'],
              newModule: path.join(dirW, 'w-b.ts'),
            },
          ],
        },
      })) as { content: { text: string }[] };
      const w1Text = w1.content.map((c) => c.text ?? '').join('\n');
      const w1Body = JSON.parse(w1.content.at(-1)?.text ?? '{}');
      const wLoc1 = locOf(fs.readFileSync(abs(wRel), 'utf8'));
      check(
        'TOOLDEV19 (w1): first converged call on huge god-class = ok terminal MINIMALLY DECOMPOSED (origin > target, floor-bound), NOT ⛔, NO PROGRESS text',
        w1Body.ok === true &&
          w1Body.changed === true &&
          /MINIMALLY DECOMPOSED/.test(w1Text) &&
          !/PROGRESS/.test(w1Text) &&
          w1Body.completionVerdict?.met === false &&
          !/ALREADY decomposed/i.test(w1Text) &&
          w1Body.progressCapped !== true &&
          wLoc1 > 350,
        JSON.stringify({ ok: w1Body.ok, met: w1Body.completionVerdict?.met, loc: wLoc1, t: w1Text.slice(0, 100) }),
      );
      // PASS 2 — SAME origin, ALREADY terminal → HARD-STOP ⛔ (NO "another
      // pass" — the multi-pass branch is structurally removed).
      const w2 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: wRel,
          plan: [
            {
              symbols: ['UnifiedAgentService.big5', 'UnifiedAgentService.big6'],
              newModule: path.join(dirW, 'w-c.ts'),
            },
          ],
        },
      })) as { content: { text: string }[] };
      const w2Text = w2.content.map((c) => c.text ?? '').join('\n');
      const w2Body = JSON.parse(w2.content.at(-1)?.text ?? '{}');
      check(
        'TOOLDEV19 (w2): 2nd decompose on the SAME (terminally decomposed) origin HARD-STOPS ⛔ — no multi-pass, nothing written',
        w2Body.ok !== true &&
          w2Body.changed !== true &&
          /ALREADY decomposed/i.test(w2Text) &&
          !fs.existsSync(abs(path.join(dirW, 'w-c.ts'))),
        w2Text.slice(0, 200),
      );
      // PASS 3 — a create_file-decomposition-trigger on the SAME origin ALSO
      // HARD-STOPS ⛔ (the trigger routes through the same terminal gate).
      const w3 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: wRel,
          plan: [{ symbols: ['UnifiedAgentService.big9'], newModule: path.join(dirW, 'w-d.ts') }],
        },
      })) as { content: { text: string }[] };
      const w3Text = w3.content.map((c) => c.text ?? '').join('\n');
      const w3Body = JSON.parse(w3.content.at(-1)?.text ?? '{}');
      check(
        'TOOLDEV19 (w3): a 3rd attempt on the terminal origin STILL HARD-STOPS ⛔ (idempotent by construction, nothing written)',
        /ALREADY decomposed/i.test(w3Text) &&
          w3Body.ok !== true &&
          w3Body.changed !== true &&
          !fs.existsSync(abs(path.join(dirW, 'w-d.ts'))),
        w3Text.slice(0, 200),
      );
    }
    // (x) a god-class that reaches TARGET MET in ONE pass → the 2nd decompose
    //     HARD-STOPS immediately (idempotency intact on completion — the
    //     original R22 re-decompose churn is still prevented).
    {
      const dirX = path.join(tmpRel, 'tooldev18-x');
      fs.mkdirSync(abs(dirX), { recursive: true });
      const xRel = path.join(dirX, 'agent.service.ts');
      const xM = Array.from({ length: 6 }, (_v, i) => `xm${i}`);
      fs.writeFileSync(
        abs(xRel),
        [
          'export class AgentXSvc {',
          ...xM.map((nm) => mkMethod(nm, 20)),
          '}',
          'export const X_CAP = 9;',
          '',
        ].join('\n'),
      );
      const x1 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: xRel,
          plan: [
            { symbols: ['AgentXSvc.xm0', 'AgentXSvc.xm1'], newModule: path.join(dirX, 'x-a.ts') },
          ],
        },
      })) as { content: { text: string }[] };
      const x1Text = x1.content.map((c) => c.text ?? '').join('\n');
      const x1Body = JSON.parse(x1.content.at(-1)?.text ?? '{}');
      const x2 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: xRel,
          plan: [{ symbols: ['AgentXSvc.xm2'], newModule: path.join(dirX, 'x-b.ts') }],
        },
      })) as { content: { text: string }[] };
      const x2Text = x2.content.map((c) => c.text ?? '').join('\n');
      const x2Body = JSON.parse(x2.content.at(-1)?.text ?? '{}');
      check(
        'TOOLDEV18 (x): ONE-pass TARGET MET → 2nd decompose HARD-STOPS immediately (R22 churn still prevented)',
        x1Body.ok === true &&
          x1Body.completionVerdict?.met === true &&
          /TARGET MET/.test(x1Text) &&
          /ALREADY decomposed/i.test(x2Text) &&
          x2Body.ok !== true &&
          x2Body.changed !== true &&
          !fs.existsSync(abs(path.join(dirX, 'x-b.ts'))),
        JSON.stringify({ met1: x1Body.completionVerdict?.met, x2: x2Text.slice(0, 80) }),
      );
    }
    // (y) DELETED in A/B TOOLDEV19: the tooldev18 "multi-pass SAFETY CAP"
    //     test (DECOMPOSE_MAX_PROGRESS_PASSES / progressCapped) asserted the
    //     now-removed multi-pass behavior. There is no multi-pass to bound —
    //     one converged call is terminal — so the cap, the counter and the
    //     decomposeProgressCapStop message no longer exist. Replaced by the
    //     TOOLDEV19 convergence/husk/idempotency/regression tests below.

    // ════════════════════════════════════════════════════════════════════
    // TOOLDEV19 (aa-dd) — the STRUCTURAL COLLAPSE acceptance tests.
    // ════════════════════════════════════════════════════════════════════
    // (aa) a god-class needing HEAVY reduction → ONE atomic_decompose_file
    //      (auto-planned via the create_file trigger) CONVERGES in a single
    //      call: real origin ≤ 350 (TARGET MET) OR ≥ ABSOLUTE_FLOOR with the
    //      terminal MINIMALLY-DECOMPOSED verdict; origin is NEVER below
    //      ABSOLUTE_FLOOR; class public API byte-stable; modules ≤ 400; and
    //      exactly ONE converged call (the 2nd trigger HARD-STOPS ⛔).
    {
      const dirAA = path.join(tmpRel, 'tooldev19-aa');
      fs.mkdirSync(abs(dirAA), { recursive: true });
      const aaRel = path.join(dirAA, 'heavy-engine.service.ts');
      const aaBig = Array.from({ length: 6 }, (_v, i) => `proc${i}`);
      const aaSmall = ['q1', 'q2', 'q3', 'q4'];
      fs.writeFileSync(
        abs(aaRel),
        [
          'export class HeavyEngine {',
          ...aaBig.map((nm) => mkMethod(nm, 70)),
          ...aaSmall.map((nm) => mkMethod(nm, 1)),
          '}',
          'export const HEAVY_CAP = 9;',
          '',
        ].join('\n'),
      );
      const aaBefore = fs.readFileSync(abs(aaRel), 'utf8');
      const aaOriginLoc0 = locOf(aaBefore);
      const aaFloor = Math.max(180, Math.round(0.4 * aaOriginLoc0));
      const aaMethodsBefore = new Set(
        (await outline(aaRel, aaBefore)).symbols
          .filter((sym) => sym.kind === 'MethodDeclaration')
          .map((sym) => sym.selector),
      );
      await client.callTool({ name: 'code_outline', arguments: { file: aaRel } });
      const aaRaw = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirAA, 'heavy-engine.helpers.ts'),
          content: 'export const x = 1;\n',
        },
      })) as { content: { text: string }[] };
      const aaText = aaRaw.content.map((c) => c.text ?? '').join('\n');
      let aaBody: {
        ok?: boolean;
        changed?: boolean;
        modules?: { module: string; symbols: string[] }[];
        completionVerdict?: { met?: boolean };
      } = {};
      try {
        aaBody = JSON.parse(aaRaw.content.at(-1)?.text ?? '{}');
      } catch {
        aaBody = {};
      }
      const aaMods = Array.isArray(aaBody.modules) ? aaBody.modules : [];
      const aaAfter = fs.readFileSync(abs(aaRel), 'utf8');
      const aaOriginAfter = locOf(aaAfter);
      let aaModsParse = aaMods.length >= 1;
      let aaMaxMod = 0;
      for (const g of aaMods) {
        if (!fs.existsSync(abs(g.module))) {
          aaModsParse = false;
          break;
        }
        const gt = fs.readFileSync(abs(g.module), 'utf8');
        if ((await outline(g.module, gt)).language !== 'ts') {
          aaModsParse = false;
          break;
        }
        aaMaxMod = Math.max(aaMaxMod, locOf(gt));
      }
      const aaMethodsAfter = new Set(
        (await outline(aaRel, aaAfter)).symbols
          .filter((sym) => sym.kind === 'MethodDeclaration')
          .map((sym) => sym.selector),
      );
      const aaApiStable =
        aaMethodsAfter.size === aaMethodsBefore.size &&
        [...aaMethodsBefore].every((x) => aaMethodsAfter.has(x));
      const aaMet = aaBody.completionVerdict?.met === true;
      const aaConverged =
        (aaMet && aaOriginAfter <= 350) ||
        (!aaMet &&
          /MINIMALLY DECOMPOSED/.test(aaText) &&
          aaOriginAfter > 350);
      const aa2 = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirAA, 'heavy-engine.more.ts'),
          content: 'export const y = 2;\n',
        },
      })) as { content: { text: string }[] };
      const aa2Text = aa2.content.map((c) => c.text ?? '').join('\n');
      check(
        'TOOLDEV19 (aa): heavy god-class — ONE auto-planned atomic_decompose_file CONVERGES (target OR safe-floor), origin NEVER < ABSOLUTE_FLOOR, API byte-stable, modules ≤ 400, exactly ONE call',
        aaBody.ok === true &&
          aaBody.changed === true &&
          aaText.includes('AUTO-EXECUTED') &&
          aaConverged &&
          aaOriginAfter >= aaFloor &&
          aaModsParse &&
          aaMaxMod <= 400 &&
          aaApiStable &&
          /ALREADY decomposed/i.test(aa2Text),
        JSON.stringify({
          originLoc0: aaOriginLoc0,
          floor: aaFloor,
          originAfter: aaOriginAfter,
          met: aaMet,
          maxMod: aaMaxMod,
          apiStable: aaApiStable,
        }),
      );
    }
    // (bb) HUSK GUARD: a class so big that hitting 350 would require driving
    //      the origin BELOW the FROZEN ABSOLUTE_FLOOR (floor > 350). The
    //      planner MUST stop floor-bound — final origin ≥ ABSOLUTE_FLOOR
    //      (NOT 9, NOT a husk) and the verdict is the terminal
    //      MINIMALLY-DECOMPOSED message (proves the cumulative frozen floor,
    //      not a per-pass recompute, structurally kills the husk).
    {
      const dirBB = path.join(tmpRel, 'tooldev19-bb');
      fs.mkdirSync(abs(dirBB), { recursive: true });
      const bbRel = path.join(dirBB, 'husk.service.ts');
      const bbBig = Array.from({ length: 12 }, (_v, i) => `heavy${i}`);
      fs.writeFileSync(
        abs(bbRel),
        [
          'export class HuskSvc {',
          ...bbBig.map((nm) => mkMethod(nm, 80)),
          '}',
          'export const HUSK_CAP = 9;',
          '',
        ].join('\n'),
      );
      const bbBefore = fs.readFileSync(abs(bbRel), 'utf8');
      const bbOriginLoc0 = locOf(bbBefore);
      const bbFloor = Math.max(180, Math.round(0.4 * bbOriginLoc0));
      const bbMethodsBefore = new Set(
        (await outline(bbRel, bbBefore)).symbols
          .filter((sym) => sym.kind === 'MethodDeclaration')
          .map((sym) => sym.selector),
      );
      await client.callTool({ name: 'code_outline', arguments: { file: bbRel } });
      const bbRaw = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirBB, 'husk.helpers.ts'),
          content: 'export const x = 1;\n',
        },
      })) as { content: { text: string }[] };
      const bbText = bbRaw.content.map((c) => c.text ?? '').join('\n');
      let bbBody: {
        ok?: boolean;
        changed?: boolean;
        modules?: { module: string; symbols: string[] }[];
        completionVerdict?: { met?: boolean };
      } = {};
      try {
        bbBody = JSON.parse(bbRaw.content.at(-1)?.text ?? '{}');
      } catch {
        bbBody = {};
      }
      const bbMods = Array.isArray(bbBody.modules) ? bbBody.modules : [];
      const bbAfter = fs.readFileSync(abs(bbRel), 'utf8');
      const bbOriginAfter = locOf(bbAfter);
      let bbModsParse = bbMods.length >= 1;
      let bbMaxMod = 0;
      for (const g of bbMods) {
        if (!fs.existsSync(abs(g.module))) {
          bbModsParse = false;
          break;
        }
        const gt = fs.readFileSync(abs(g.module), 'utf8');
        if ((await outline(g.module, gt)).language !== 'ts') {
          bbModsParse = false;
          break;
        }
        bbMaxMod = Math.max(bbMaxMod, locOf(gt));
      }
      const bbMethodsAfter = new Set(
        (await outline(bbRel, bbAfter)).symbols
          .filter((sym) => sym.kind === 'MethodDeclaration')
          .map((sym) => sym.selector),
      );
      const bbApiStable =
        bbMethodsAfter.size === bbMethodsBefore.size &&
        [...bbMethodsBefore].every((x) => bbMethodsAfter.has(x));
      check(
        'TOOLDEV19 (bb): husk guard — floor > 350, planner stops FLOOR-BOUND, final origin ≥ ABSOLUTE_FLOOR (NOT 9/husk), terminal MINIMALLY DECOMPOSED, API byte-stable, modules ≤ 400',
        bbBody.ok === true &&
          bbBody.changed === true &&
          bbText.includes('AUTO-EXECUTED') &&
          bbFloor > 350 &&
          bbBody.completionVerdict?.met === false &&
          /MINIMALLY DECOMPOSED/.test(bbText) &&
          !/PROGRESS/.test(bbText) &&
          bbOriginAfter >= bbFloor &&
          bbOriginAfter > 9 &&
          bbModsParse &&
          bbMaxMod <= 400 &&
          bbApiStable,
        JSON.stringify({
          originLoc0: bbOriginLoc0,
          floor: bbFloor,
          originAfter: bbOriginAfter,
          met: bbBody.completionVerdict?.met,
          maxMod: bbMaxMod,
        }),
      );
    }
    // (cc) IDEMPOTENT BY CONSTRUCTION: after the SINGLE converged call (here
    //      the heavy auto-planned one from a fresh god-class), BOTH a 2nd
    //      atomic_decompose_file AND a create_file-decomposition-trigger on
    //      the SAME origin HARD-STOP ⛔ (terminal — no "another pass"),
    //      nothing written by either.
    {
      const dirCC = path.join(tmpRel, 'tooldev19-cc');
      fs.mkdirSync(abs(dirCC), { recursive: true });
      const ccRel = path.join(dirCC, 'idem.service.ts');
      const ccBig = Array.from({ length: 6 }, (_v, i) => `run${i}`);
      fs.writeFileSync(
        abs(ccRel),
        [
          'export class IdemSvc {',
          ...ccBig.map((nm) => mkMethod(nm, 70)),
          '}',
          'export const IDEM_CAP = 9;',
          '',
        ].join('\n'),
      );
      await client.callTool({ name: 'code_outline', arguments: { file: ccRel } });
      const cc1 = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirCC, 'idem.helpers.ts'),
          content: 'export const x = 1;\n',
        },
      })) as { content: { text: string }[] };
      const cc1Text = cc1.content.map((c) => c.text ?? '').join('\n');
      const cc1Body = JSON.parse(cc1.content.at(-1)?.text ?? '{}');
      // 2nd: explicit atomic_decompose_file on the same origin → ⛔.
      const cc2 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: ccRel,
          plan: [{ symbols: ['IdemSvc.run0'], newModule: path.join(dirCC, 'cc-x.ts') }],
        },
      })) as { content: { text: string }[] };
      const cc2Text = cc2.content.map((c) => c.text ?? '').join('\n');
      const cc2Body = JSON.parse(cc2.content.at(-1)?.text ?? '{}');
      // 3rd: a create_file-decomposition-trigger on the same origin → ⛔.
      const cc3 = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirCC, 'idem.more.ts'),
          content: 'export const y = 2;\n',
        },
      })) as { content: { text: string }[] };
      const cc3Text = cc3.content.map((c) => c.text ?? '').join('\n');
      check(
        'TOOLDEV19 (cc): after the single converged call, BOTH a 2nd atomic_decompose_file AND a create_file-trigger HARD-STOP ⛔ (terminal, nothing written)',
        cc1Body.ok === true &&
          cc1Body.changed === true &&
          cc1Text.includes('AUTO-EXECUTED') &&
          cc2Body.ok !== true &&
          cc2Body.changed !== true &&
          /ALREADY decomposed/i.test(cc2Text) &&
          !fs.existsSync(abs(path.join(dirCC, 'cc-x.ts'))) &&
          /ALREADY decomposed/i.test(cc3Text),
        JSON.stringify({
          cc1: cc1Body.ok,
          cc2: cc2Text.slice(0, 80),
          cc3: cc3Text.slice(0, 80),
        }),
      );
    }
    // (dd) REGRESSION: top-level (non-god-class) decompose byte-identical to
    //      before; clean class-method extraction still behavior-preserving;
    //      canExtractClassMethod still gates an unsafe private-accessing
    //      method (tooldev12-17 invariants intact under the collapse).
    {
      const dirDD = path.join(tmpRel, 'tooldev19-dd');
      fs.mkdirSync(abs(dirDD), { recursive: true });
      const ddRel = path.join(dirDD, 'plain19.ts');
      fs.writeFileSync(
        abs(ddRel),
        [
          'export function da(): number { return 1; }',
          'export function db(): number { return 2; }',
          'export function dc(): number { return 3; }',
          '',
        ].join('\n'),
      );
      const dd1 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: ddRel,
          plan: [
            { symbols: ['da', 'db'], newModule: path.join(dirDD, 'd1.ts') },
            { symbols: ['dc'], newModule: path.join(dirDD, 'd2.ts') },
          ],
        },
      })) as { content: { text: string }[] };
      const dd1Body = JSON.parse(dd1.content.at(-1)?.text ?? '{}');
      const dd1Text = dd1.content.map((c) => c.text ?? '').join('\n');
      const dd2 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: ddRel,
          plan: [{ symbols: ['da'], newModule: path.join(dirDD, 'd3.ts') }],
        },
      })) as { content: { text: string }[] };
      const dd2Text = dd2.content.map((c) => c.text ?? '').join('\n');
      const dd2Body = JSON.parse(dd2.content.at(-1)?.text ?? '{}');
      const ddClean = await moveSymbolToFile({
        fromRel: 'mx/dd-src.ts',
        fromBefore: [
          'export class DCalc {',
          '  base = 3;',
          '  addPub(n: number): number { return n + this.base; }',
          '  pureD(n: number): number { return n * 2; }',
          '}',
          '',
        ].join('\n'),
        toRel: 'mx/dd-helpers.ts',
        toBefore: '',
        toExists: false,
        selector: 'DCalc.pureD',
        leaveReExport: true,
      });
      const ddGateSrc = [
        'export class DGate {',
        '  #sek = 7;',
        '  leak(): number { return this.#sek + 1; }',
        '  clean(n: number): number { return n + 1; }',
        '}',
        '',
      ].join('\n');
      const ddGatePriv = await canExtractClassMethod(
        'mx/dd-gate.ts',
        ddGateSrc,
        'DGate.leak',
      );
      const ddGateClean = await canExtractClassMethod(
        'mx/dd-gate.ts',
        ddGateSrc,
        'DGate.clean',
      );
      check(
        'TOOLDEV19 (dd): regression — top-level decompose unchanged + 2nd HARD-STOPS (terminal) + clean class-method extraction preserving + gate refuses unsafe',
        dd1Body.ok === true &&
          dd1Body.changed === true &&
          dd1Body.completionVerdict?.met === true &&
          /TARGET MET/.test(dd1Text) &&
          dd2Body.ok !== true &&
          /ALREADY decomposed/i.test(dd2Text) &&
          !fs.existsSync(abs(path.join(dirDD, 'd3.ts'))) &&
          /export function pureD/.test(ddClean.to.after) &&
          /return pureD\(/.test(ddClean.from.after) &&
          /pureD\(n: number\): number/.test(ddClean.from.after) &&
          ddClean.from.validation.ok &&
          ddClean.to.validation.ok &&
          ddGatePriv.ok === false &&
          ddGateClean.ok === true,
        JSON.stringify({
          dd1: dd1Body.ok,
          met: dd1Body.completionVerdict?.met,
          dd2: dd2Text.slice(0, 60),
          gatePriv: ddGatePriv.ok,
          gateClean: ddGateClean.ok,
        }),
      );
    }
    // (z) REGRESSION: top-level decompose unchanged + 2nd HARD-STOPS;
    //     clean class-method extraction still behavior-preserving;
    //     canExtractClassMethod still gates unsafe (private-accessing).
    {
      const dirZ = path.join(tmpRel, 'tooldev18-z');
      fs.mkdirSync(abs(dirZ), { recursive: true });
      const zRel = path.join(dirZ, 'plain18.ts');
      fs.writeFileSync(
        abs(zRel),
        [
          'export function za(): number { return 1; }',
          'export function zb(): number { return 2; }',
          'export function zc(): number { return 3; }',
          '',
        ].join('\n'),
      );
      const z1 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: zRel,
          plan: [
            { symbols: ['za', 'zb'], newModule: path.join(dirZ, 'z1.ts') },
            { symbols: ['zc'], newModule: path.join(dirZ, 'z2.ts') },
          ],
        },
      })) as { content: { text: string }[] };
      const z1Body = JSON.parse(z1.content.at(-1)?.text ?? '{}');
      const z2 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: zRel,
          plan: [{ symbols: ['za'], newModule: path.join(dirZ, 'z3.ts') }],
        },
      })) as { content: { text: string }[] };
      const z2Text = z2.content.map((c) => c.text ?? '').join('\n');
      const z2Body = JSON.parse(z2.content.at(-1)?.text ?? '{}');
      const zClean = await moveSymbolToFile({
        fromRel: 'mx/z-src.ts',
        fromBefore: [
          'export class ZCalc {',
          '  base = 3;',
          '  addPub(n: number): number { return n + this.base; }',
          '  pureZ(n: number): number { return n * 2; }',
          '}',
          '',
        ].join('\n'),
        toRel: 'mx/z-helpers.ts',
        toBefore: '',
        toExists: false,
        selector: 'ZCalc.pureZ',
        leaveReExport: true,
      });
      const zGateSrc = [
        'export class ZGate {',
        '  #sek = 7;',
        '  leak(): number { return this.#sek + 1; }',
        '  clean(n: number): number { return n + 1; }',
        '}',
        '',
      ].join('\n');
      const zGatePriv = await canExtractClassMethod('mx/z-gate.ts', zGateSrc, 'ZGate.leak');
      const zGateClean = await canExtractClassMethod('mx/z-gate.ts', zGateSrc, 'ZGate.clean');
      check(
        'TOOLDEV18 (z): regression — top-level decompose unchanged + 2nd HARD-STOPS (met) + clean class-method extraction preserving + gate refuses unsafe',
        z1Body.ok === true &&
          z1Body.changed === true &&
          z1Body.completionVerdict?.met === true &&
          z2Body.ok !== true &&
          /ALREADY decomposed/i.test(z2Text) &&
          !fs.existsSync(abs(path.join(dirZ, 'z3.ts'))) &&
          /export function pureZ/.test(zClean.to.after) &&
          /return pureZ\(/.test(zClean.from.after) &&
          /pureZ\(n: number\): number/.test(zClean.from.after) &&
          zClean.from.validation.ok &&
          zClean.to.validation.ok &&
          zGatePriv.ok === false &&
          zGateClean.ok === true,
        JSON.stringify({
          z1: z1Body.ok,
          met: z1Body.completionVerdict?.met,
          z2: z2Text.slice(0, 60),
          gatePriv: zGatePriv.ok,
          gateClean: zGateClean.ok,
        }),
      );
    }
    // ════════════════════════════════════════════════════════════════════
    // TOOLDEV20 — the advisory post-TARGET-MET STOP is now an ENFORCED
    // invariant inferred from CONTENT + STATE (not a filename heuristic):
    // after the ONE convergent decompose the model PHYSICALLY cannot add
    // the R32-style manual restructuring tail.
    // ════════════════════════════════════════════════════════════════════
    // (ee) decompose to TARGET MET, then atomic_create_file a
    //      DIFFERENTLY-NAMED module in a NON-derived dir (the tooldev11/18
    //      filename heuristic would MISS it) whose content imports/re-exports
    //      from the decomposed origin → HARD-STOP ⛔ via the content check.
    {
      const dirEE = path.join(tmpRel, 'tooldev20-ee');
      fs.mkdirSync(abs(dirEE), { recursive: true });
      const eeRel = path.join(dirEE, 'ee.service.ts');
      const eeBig = Array.from({ length: 6 }, (_v, i) => `run${i}`);
      fs.writeFileSync(
        abs(eeRel),
        [
          'export class EeSvc {',
          ...eeBig.map((nm) => mkMethod(nm, 70)),
          '}',
          'export const EE_CAP = 9;',
          '',
        ].join('\n'),
      );
      await client.callTool({ name: 'code_outline', arguments: { file: eeRel } });
      const eeAuto = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirEE, 'ee.helpers.ts'),
          content: 'export const x = 1;\n',
        },
      })) as { content: { text: string }[] };
      const eeAutoText = eeAuto.content.map((c) => c.text ?? '').join('\n');
      const eeAutoBody = JSON.parse(eeAuto.content.at(-1)?.text ?? '{}');
      // differently-named module, NON-derived dir, but content re-exports
      // FROM the decomposed origin — the R32 gap the filename heuristic missed.
      const eeTailRel = path.join(tmpRel, 'tooldev20-ee-tail', 'ee-extra-pipeline.ts');
      const eeTail = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: eeTailRel,
          content:
            "export { EeSvc } from '../tooldev20-ee/ee.service';\nexport const wrap = 1;\n",
        },
      })) as { content: { text: string }[] };
      const eeTailText = eeTail.content.map((c) => c.text ?? '').join('\n');
      const eeTailBody = JSON.parse(eeTail.content.at(-1)?.text ?? '{}');
      check(
        'TOOLDEV20 (ee): after TARGET MET, a DIFFERENTLY-NAMED module (filename heuristic misses) that re-exports the decomposed origin HARD-STOPS ⛔ via content check — nothing written',
        eeAutoBody.ok === true &&
          eeAutoBody.changed === true &&
          /AUTO-EXECUTED/.test(eeAutoText) &&
          eeTailBody.ok !== true &&
          eeTailBody.changed !== true &&
          /ALREADY decomposed/i.test(eeTailText) &&
          !fs.existsSync(abs(eeTailRel)),
        JSON.stringify({ ee: eeAutoBody.ok, tail: eeTailText.slice(0, 90) }),
      );
    }
    // (ff) after TARGET MET: atomic_move_symbol_to_file fromFile=origin AND
    //      atomic_replace_range on the origin → BOTH HARD-STOP ⛔.
    {
      const dirFF = path.join(tmpRel, 'tooldev20-ff');
      fs.mkdirSync(abs(dirFF), { recursive: true });
      const ffRel = path.join(dirFF, 'ff.service.ts');
      const ffBig = Array.from({ length: 6 }, (_v, i) => `run${i}`);
      const ffOrigin = [
        'export class FfSvc {',
        ...ffBig.map((nm) => mkMethod(nm, 70)),
        '}',
        'export const FF_CAP = 9;',
        '',
      ].join('\n');
      fs.writeFileSync(abs(ffRel), ffOrigin);
      await client.callTool({ name: 'code_outline', arguments: { file: ffRel } });
      const ffAuto = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirFF, 'ff.helpers.ts'),
          content: 'export const x = 1;\n',
        },
      })) as { content: { text: string }[] };
      const ffAutoText = ffAuto.content.map((c) => c.text ?? '').join('\n');
      const ffAutoBody = JSON.parse(ffAuto.content.at(-1)?.text ?? '{}');
      const ffMoveTo = path.join(dirFF, 'ff-moved.ts');
      const ffMove = (await client.callTool({
        name: 'atomic_move_symbol_to_file',
        arguments: { fromFile: ffRel, symbol: 'FfSvc.run0', toFile: ffMoveTo },
      })) as { content: { text: string }[] };
      const ffMoveText = ffMove.content.map((c) => c.text ?? '').join('\n');
      const ffMoveBody = JSON.parse(ffMove.content.at(-1)?.text ?? '{}');
      const ffRR = (await client.callTool({
        name: 'atomic_replace_range',
        arguments: {
          file: ffRel,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 1,
          newText: '// tail\n',
        },
      })) as { content: { text: string }[] };
      const ffRRText = ffRR.content.map((c) => c.text ?? '').join('\n');
      const ffRRBody = JSON.parse(ffRR.content.at(-1)?.text ?? '{}');
      const ffNow = fs.readFileSync(abs(ffRel), 'utf8');
      check(
        'TOOLDEV20 (ff): after TARGET MET, move_symbol_to_file fromFile=origin AND replace_range on origin BOTH HARD-STOP ⛔ — origin untouched, move target not written',
        ffAutoBody.ok === true &&
          /AUTO-EXECUTED/.test(ffAutoText) &&
          ffMoveBody.ok !== true &&
          /ALREADY decomposed/i.test(ffMoveText) &&
          !fs.existsSync(abs(ffMoveTo)) &&
          ffRRBody.ok !== true &&
          /ALREADY decomposed/i.test(ffRRText) &&
          !ffNow.startsWith('// tail'),
        JSON.stringify({
          mv: ffMoveText.slice(0, 70),
          rr: ffRRText.slice(0, 70),
        }),
      );
    }
    // (gg) after TARGET MET, atomic_create_file of a genuinely UNRELATED new
    //      file (no reference to the decomposed origin / its moved symbols,
    //      unrelated concern, non-derived dir) → still ALLOWED (no
    //      false-positive over-block).
    {
      const dirGG = path.join(tmpRel, 'tooldev20-gg');
      fs.mkdirSync(abs(dirGG), { recursive: true });
      const ggRel = path.join(dirGG, 'gg.service.ts');
      const ggBig = Array.from({ length: 6 }, (_v, i) => `run${i}`);
      fs.writeFileSync(
        abs(ggRel),
        [
          'export class GgSvc {',
          ...ggBig.map((nm) => mkMethod(nm, 70)),
          '}',
          'export const GG_CAP = 9;',
          '',
        ].join('\n'),
      );
      await client.callTool({ name: 'code_outline', arguments: { file: ggRel } });
      const ggAuto = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirGG, 'gg.helpers.ts'),
          content: 'export const x = 1;\n',
        },
      })) as { content: { text: string }[] };
      const ggAutoText = ggAuto.content.map((c) => c.text ?? '').join('\n');
      const ggAutoBody = JSON.parse(ggAuto.content.at(-1)?.text ?? '{}');
      const ggUnRel = path.join(tmpRel, 'tooldev20-gg-unrelated', 'weather.ts');
      const ggUn = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: ggUnRel,
          content:
            'export function celsiusToF(c: number): number {\n  return (c * 9) / 5 + 32;\n}\n',
        },
      })) as { content: { text: string }[] };
      const ggUnBody = JSON.parse(ggUn.content.at(-1)?.text ?? '{}');
      check(
        'TOOLDEV20 (gg): after TARGET MET, a genuinely UNRELATED new file (no origin reference, no moved symbol) is still ALLOWED — no false-positive over-block',
        ggAutoBody.ok === true &&
          /AUTO-EXECUTED/.test(ggAutoText) &&
          ggUnBody.ok === true &&
          ggUnBody.changed === true &&
          fs.existsSync(abs(ggUnRel)),
        JSON.stringify({ gg: ggAutoBody.ok, un: ggUnBody.ok }),
      );
    }
    // (hh) REGRESSION: a god-class first decompose still reaches TARGET MET
    //      in ONE op; top-level decompose unchanged + 2nd HARD-STOPS;
    //      class-method extraction behavior-preserving; canExtractClassMethod
    //      still gates an unsafe private-accessing method (tooldev12-19
    //      invariants intact under the tooldev20 enforced guard).
    {
      const dirHH = path.join(tmpRel, 'tooldev20-hh');
      fs.mkdirSync(abs(dirHH), { recursive: true });
      const hhRel = path.join(dirHH, 'hh.service.ts');
      const hhBig = Array.from({ length: 6 }, (_v, i) => `run${i}`);
      fs.writeFileSync(
        abs(hhRel),
        [
          'export class HhSvc {',
          ...hhBig.map((nm) => mkMethod(nm, 70)),
          '}',
          'export const HH_CAP = 9;',
          '',
        ].join('\n'),
      );
      await client.callTool({ name: 'code_outline', arguments: { file: hhRel } });
      const hhAuto = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: path.join(dirHH, 'hh.helpers.ts'),
          content: 'export const x = 1;\n',
        },
      })) as { content: { text: string }[] };
      const hhAutoText = hhAuto.content.map((c) => c.text ?? '').join('\n');
      const hhAutoBody = JSON.parse(hhAuto.content.at(-1)?.text ?? '{}');
      const dirHT = path.join(tmpRel, 'tooldev20-hh-top');
      fs.mkdirSync(abs(dirHT), { recursive: true });
      const htRel = path.join(dirHT, 'plain20.ts');
      fs.writeFileSync(
        abs(htRel),
        [
          'export function ha(): number { return 1; }',
          'export function hb(): number { return 2; }',
          'export function hc(): number { return 3; }',
          '',
        ].join('\n'),
      );
      const ht1 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: htRel,
          plan: [
            { symbols: ['ha', 'hb'], newModule: path.join(dirHT, 'h1.ts') },
            { symbols: ['hc'], newModule: path.join(dirHT, 'h2.ts') },
          ],
        },
      })) as { content: { text: string }[] };
      const ht1Body = JSON.parse(ht1.content.at(-1)?.text ?? '{}');
      const ht1Text = ht1.content.map((c) => c.text ?? '').join('\n');
      const ht2 = (await client.callTool({
        name: 'atomic_decompose_file',
        arguments: {
          file: htRel,
          plan: [{ symbols: ['ha'], newModule: path.join(dirHT, 'h3.ts') }],
        },
      })) as { content: { text: string }[] };
      const ht2Text = ht2.content.map((c) => c.text ?? '').join('\n');
      const ht2Body = JSON.parse(ht2.content.at(-1)?.text ?? '{}');
      const hhClean = await moveSymbolToFile({
        fromRel: 'mx/hh-src.ts',
        fromBefore: [
          'export class HCalc {',
          '  base = 3;',
          '  addPub(n: number): number { return n + this.base; }',
          '  pureH(n: number): number { return n * 2; }',
          '}',
          '',
        ].join('\n'),
        toRel: 'mx/hh-helpers.ts',
        toBefore: '',
        toExists: false,
        selector: 'HCalc.pureH',
        leaveReExport: true,
      });
      const hhGateSrc = [
        'export class HGate {',
        '  #sek = 7;',
        '  leak(): number { return this.#sek + 1; }',
        '  clean(n: number): number { return n + 1; }',
        '}',
        '',
      ].join('\n');
      const hhGatePriv = await canExtractClassMethod(
        'mx/hh-gate.ts',
        hhGateSrc,
        'HGate.leak',
      );
      const hhGateClean = await canExtractClassMethod(
        'mx/hh-gate.ts',
        hhGateSrc,
        'HGate.clean',
      );
      check(
        'TOOLDEV20 (hh): regression — god-class first decompose ONE-op TARGET MET + top-level decompose unchanged + 2nd HARD-STOPS + class-method extraction preserving + gate refuses unsafe',
        hhAutoBody.ok === true &&
          hhAutoBody.changed === true &&
          /AUTO-EXECUTED/.test(hhAutoText) &&
          /TARGET MET/.test(hhAutoText) &&
          hhAutoBody.completionVerdict?.met === true &&
          ht1Body.ok === true &&
          ht1Body.completionVerdict?.met === true &&
          /TARGET MET/.test(ht1Text) &&
          ht2Body.ok !== true &&
          /ALREADY decomposed/i.test(ht2Text) &&
          !fs.existsSync(abs(path.join(dirHT, 'h3.ts'))) &&
          /export function pureH/.test(hhClean.to.after) &&
          /return pureH\(/.test(hhClean.from.after) &&
          hhClean.from.validation.ok &&
          hhClean.to.validation.ok &&
          hhGatePriv.ok === false &&
          hhGateClean.ok === true,
        JSON.stringify({
          hh: hhAutoBody.ok,
          hhMet: hhAutoBody.completionVerdict?.met,
          ht1: ht1Body.completionVerdict?.met,
          ht2: ht2Text.slice(0, 50),
          gatePriv: hhGatePriv.ok,
          gateClean: hhGateClean.ok,
        }),
      );
    }
  } finally {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpAbs, { recursive: true, force: true });
  }
}

// ── Part K — class-method API-PRESERVING extraction (tooldev12). The
//    dominant real shape is a NestJS service CLASS; decomposition means
//    extracting METHODS. Each test proves the public class surface is
//    byte-stable and the runtime behavior is preserved (instance harness:
//    compile before/after to CJS and call the real method). ──────────────
async function partK(): Promise<void> {
  process.stdout.write('Part K — class-method API-preserving extraction (engine)\n');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-mx-'));
  fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ type: 'commonjs' }));
  const req = createRequire(path.join(tmp, 'x.cjs'));
  const emit = (file: string, code: string): void => {
    const out = tsmod.transpileModule(code, {
      compilerOptions: {
        module: tsmod.ModuleKind.CommonJS,
        target: tsmod.ScriptTarget.ES2020,
      },
    }).outputText;
    fs.writeFileSync(path.join(tmp, file), out);
  };
  // Fresh require each load: drop .js artifacts + clear the require cache so
  // the before/after modules never alias.
  const loadSvc = (srcText: string, tgtText?: string): { Svc: new () => unknown } => {
    for (const f of fs.readdirSync(tmp)) if (f.endsWith('.js')) fs.rmSync(path.join(tmp, f));
    for (const k of Object.keys(req.cache ?? {})) delete (req.cache as Record<string, unknown>)[k];
    emit('source.js', srcText);
    if (tgtText !== undefined) emit('target.js', tgtText);
    return req(path.join(tmp, 'source.js')) as { Svc: new () => unknown };
  };
  try {
    // (a) this-free helper method → free function, no `self`, behavior kept
    {
      const before = [
        'export class Svc {',
        '  greeting = "hi";',
        '  format(x: number): string {',
        '    return `n=${x}`;',
        '  }',
        '}',
        '',
      ].join('\n');
      const baseline = (
        new (loadSvc(before).Svc)() as { format: (n: number) => string }
      ).format(7);
      const r = await moveSymbolToFile({
        fromRel: 'mx/source.ts',
        fromBefore: before,
        toRel: 'mx/target.ts',
        toBefore: '',
        toExists: false,
        selector: 'Svc.format',
        leaveReExport: true,
      });
      check(
        'K(a): both files validate (no syntax regression)',
        r.from.validation.ok && r.to.validation.ok,
        JSON.stringify({ f: r.from.validation, t: r.to.validation }),
      );
      check(
        'K(a): target has a top-level `export function format(`',
        /export function format\s*\(/.test(r.to.after),
        r.to.after,
      );
      check(
        'K(a): origin method delegates `return format(x);`',
        /return format\(x\);/.test(r.from.after),
        r.from.after,
      );
      check(
        'K(a): origin public API byte-stable (class + method signature kept)',
        /class Svc/.test(r.from.after) && /\bformat\(x: number\): string\b/.test(r.from.after),
        r.from.after,
      );
      check(
        'K(a): no `self` parameter (the method is `this`-free)',
        !/function format\([^)]*\bself\b/.test(r.to.after),
        r.to.after,
      );
      const after = (
        new (loadSvc(r.from.after, r.to.after).Svc)() as { format: (n: number) => string }
      ).format(7);
      check(
        'K(a): behavior preserved (instance.format equal before/after)',
        after === baseline && baseline === 'n=7',
        `${baseline} -> ${after}`,
      );
    }
    // (b) this.dep + this.method (public) → `self: Svc` first param
    {
      const before = [
        'export class Svc {',
        '  dep = 10;',
        '  scale(k: number): number {',
        '    return this.dep * k + this.bonus();',
        '  }',
        '  bonus(): number { return 1; }',
        '}',
        '',
      ].join('\n');
      const baseline = (
        new (loadSvc(before).Svc)() as { scale: (k: number) => number }
      ).scale(3);
      const r = await moveSymbolToFile({
        fromRel: 'mx/source.ts',
        fromBefore: before,
        toRel: 'mx/target.ts',
        toBefore: '',
        toExists: false,
        selector: 'Svc.scale',
        leaveReExport: true,
      });
      check(
        'K(b): both files validate',
        r.from.validation.ok && r.to.validation.ok,
        JSON.stringify({ f: r.from.validation, t: r.to.validation }),
      );
      check(
        'K(b): helper has `self: Svc` first param',
        /export function scale\(self: Svc, k: number\): number/.test(r.to.after),
        r.to.after,
      );
      check(
        'K(b): helper body rewrites this → self (self.dep / self.bonus())',
        /self\.dep \* k \+ self\.bonus\(\)/.test(r.to.after),
        r.to.after,
      );
      check(
        'K(b): origin delegates `return scale(this, k);`',
        /return scale\(this, k\);/.test(r.from.after),
        r.from.after,
      );
      check(
        'K(b): origin imports the helper back (one-shot, zero cleanup)',
        /import \{ scale \} from ['"]\.\/target['"]/.test(r.from.after),
        r.from.after,
      );
      const after = (
        new (loadSvc(r.from.after, r.to.after).Svc)() as { scale: (k: number) => number }
      ).scale(3);
      check(
        'K(b): behavior preserved via instance harness (10*3+1)',
        after === baseline && baseline === 31,
        `${baseline} -> ${after}`,
      );
    }
    // (c) private field, target = different file → PRECISE refusal, not the
    //     generic "nested" dead-end; nothing written.
    {
      const before = [
        'export class Svc {',
        '  private secret = 7;',
        '  reveal(): number { return this.secret + 1; }',
        '}',
        '',
      ].join('\n');
      let threw = false;
      let msg = '';
      try {
        await moveSymbolToFile({
          fromRel: 'mx/source.ts',
          fromBefore: before,
          toRel: 'mx/other.ts',
          toBefore: '',
          toExists: false,
          selector: 'Svc.reveal',
          leaveReExport: true,
        });
      } catch (e) {
        threw = true;
        msg = e instanceof Error ? e.message : String(e);
      }
      check('K(c): private cross-file extraction REFUSED', threw, msg);
      check(
        'K(c): refusal names the private member [secret] + is actionable',
        /private\/protected member\(s\) \[secret\]/.test(msg) &&
          /atomic_edit_symbol/.test(msg),
        msg,
      );
      check(
        'K(c): NOT the generic "nested" dead-end message',
        !/only top-level symbols can be moved/.test(msg) && !/ is nested/.test(msg),
        msg,
      );
    }
    // (e) regression: a genuine TOP-LEVEL function still moves exactly as
    //     before (re-export left, symbol relocated, both files validate).
    {
      const before = [
        "import { join } from 'node:path';",
        'export function topUtil(a: string): string { return join(a, "z"); }',
        'export function other(): string { return topUtil("x"); }',
        '',
      ].join('\n');
      const r = await moveSymbolToFile({
        fromRel: 'mx/source.ts',
        fromBefore: before,
        toRel: 'mx/target.ts',
        toBefore: '',
        toExists: false,
        selector: 'topUtil',
        leaveReExport: true,
      });
      check(
        'K(e): top-level move unchanged — symbol left, re-export added',
        !/function topUtil/.test(r.from.after) &&
          /export \{ topUtil \} from ['"]\.\/target['"]/.test(r.from.after) &&
          /export function topUtil/.test(r.to.after) &&
          r.leftReExport === true,
        JSON.stringify({ from: r.from.after, to: r.to.after }),
      );
      check(
        'K(e): top-level move still validates both files',
        r.from.validation.ok && r.to.validation.ok,
        JSON.stringify({ f: r.from.validation, t: r.to.validation }),
      );
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ── Part TD26 — VERIFICATION-ECONOMY SELF-CERTIFICATION. Every successful
//    mutating op now appends ONE compact OS-VALIDATED line (incl. its trace
//    path) steering the model to verify ONCE at the end, not between ops;
//    preview emits a clearly-different provisional line. Append-only — prior
//    structured fields + tooldev14/25 directives stay intact. ──────────────
async function partTD26(): Promise<void> {
  process.stdout.write('Part TD26 — verification-economy self-certification (live MCP)\n');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const repoRoot = path.resolve(SOURCE_DIR, '..', '..', '..');
  const tmpRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-td26.${process.pid}`);
  const tmpAbs = path.join(repoRoot, tmpRel);
  fs.mkdirSync(tmpAbs, { recursive: true });
  const W = (name: string, body: string): void => {
    fs.writeFileSync(path.join(tmpAbs, name), body);
  };
  const rel = (name: string): string => path.join(tmpRel, name);
  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['--yes', 'tsx', path.join(SOURCE_DIR, 'server.ts')],
    cwd: repoRoot,
    stderr: 'inherit',
  });
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = (await client.callTool({ name, arguments: args })) as {
      content: { text: string }[];
      isError?: boolean;
    };
    const body = JSON.parse(res.content.at(-1)?.text ?? '{}') as Record<string, unknown>;
    return { res, body, human: String(body.summaryForHuman ?? body.summary ?? '') };
  };
  // Extract the single OS-VALIDATED line; assert exactly one, ≤240 chars (one
  // physical line by construction of split), carrying a real trace path.
  const osLineOk = (human: string): { ok: boolean; detail: string } => {
    const lines = human.split('\n').filter((l) => l.includes('OS-VALIDATED'));
    const line = lines[0] ?? '';
    return {
      ok:
        lines.length === 1 &&
        line.length <= 240 &&
        line.includes('.atomic/traces/op_'),
      detail: `count=${lines.length} len=${line.length} "${line.slice(0, 70)}"`,
    };
  };
  try {
    await client.connect(transport);

    // ── (ae) every sampled mutating op self-certifies ──────────────────────
    W('ed.ts', 'export function f(x: number): number {\n  return x;\n}\n');
    const ed = await call('atomic_edit_symbol', {
      file: rel('ed.ts'),
      selector: 'f',
      op: 'replace',
      code: 'export function f(x: number): number {\n  return x + 1;\n}',
    });
    {
      const r = osLineOk(ed.human);
      check('(ae) edit_symbol OS-VALIDATED + trace, 1 line ≤240', ed.body.ok === true && r.ok, r.detail);
    }

    W('rt.ts', 'export const A = 1;\n');
    const rt = await call('atomic_replace_text', {
      file: rel('rt.ts'),
      oldText: 'export const A = 1;',
      newText: 'export const A = 2;',
    });
    {
      const r = osLineOk(rt.human);
      check('(ae) replace_text OS-VALIDATED line', rt.body.ok === true && r.ok, r.detail);
    }

    W('imp.ts', 'export const z = 1;\n');
    const im = await call('atomic_add_import', {
      file: rel('imp.ts'),
      module: './dep.js',
      name: 'dep',
    });
    {
      const r = osLineOk(im.human);
      check('(ae) add_import OS-VALIDATED line', im.body.ok === true && r.ok, r.detail);
    }

    W('ins.ts', 'export const head = 1;\n');
    const ins = await call('atomic_insert_at', {
      file: rel('ins.ts'),
      line: 2,
      column: 1,
      text: 'export const tail = 2;\n',
    });
    {
      const r = osLineOk(ins.human);
      check('(ae) insert_at OS-VALIDATED line', ins.body.ok === true && r.ok, r.detail);
    }

    W('txa.ts', 'export interface D {\n  a: string;\n}\n');
    const tx = await call('atomic_transaction', {
      plan: [
        {
          file: rel('txa.ts'),
          ops: [
            {
              op: 'insert_after_anchor',
              anchorText: '  a: string;',
              insertText: '\n  b: string;',
            },
          ],
        },
      ],
    });
    {
      const r = osLineOk(tx.human);
      check('(ae) transaction (insert_after_anchor) OS-VALIDATED line', tx.body.ok === true && r.ok, r.detail);
    }

    const cf = await call('atomic_create_file', {
      file: rel('cf.ts'),
      content: 'export const created = true;\n',
    });
    {
      const r = osLineOk(cf.human);
      check('(ae) create_file OS-VALIDATED line', cf.body.ok === true && r.ok, r.detail);
    }

    fs.writeFileSync(
      path.join(tmpAbs, 'tsconfig.json'),
      JSON.stringify({ compilerOptions: { strict: false, noEmit: true }, include: ['*.ts'] }),
    );
    W(
      'xf.ts',
      'export function oldName(n: number): number {\n  return n;\n}\nexport const u = oldName(2);\n',
    );
    const xf = await call('atomic_rename_symbol_cross_file', {
      file: rel('xf.ts'),
      selector: 'oldName',
      newName: 'newName',
    });
    {
      const r = osLineOk(xf.human);
      check('(ae) rename_symbol_cross_file OS-VALIDATED + trace', xf.body.ok === true && r.ok, r.detail);
    }

    W(
      'dec.ts',
      [
        'export function alpha(): number {',
        '  return 1;',
        '}',
        'export function beta(): number {',
        '  return 2;',
        '}',
        'export const gamma = alpha() + beta();',
        '',
      ].join('\n'),
    );
    const dec = await call('atomic_decompose_file', {
      file: rel('dec.ts'),
      plan: [{ symbols: ['alpha', 'beta'], newModule: rel('dec.part.ts') }],
    });
    {
      const r = osLineOk(dec.human);
      check('(ae) decompose OS-VALIDATED line', dec.body.ok === true && r.ok, r.detail);
    }

    // ── (af) preview must NOT claim OS-VALIDATED; MUST carry △ PREVIEW ──────
    W('pv.ts', 'export function p(x: number): number {\n  return x;\n}\n');
    const pvE = await call('atomic_edit_symbol', {
      file: rel('pv.ts'),
      selector: 'p',
      op: 'replace',
      code: 'export function p(x: number): number {\n  return x * 2;\n}',
      preview: true,
    });
    check(
      '(af) edit_symbol preview: NO OS-VALIDATED, has △ PREVIEW',
      pvE.body.preview === true &&
        !pvE.human.includes('OS-VALIDATED') &&
        pvE.human.includes('△ PREVIEW'),
      pvE.human.slice(-120),
    );
    W('pvt.ts', 'export const q = 1;\n');
    const pvT = await call('atomic_transaction', {
      preview: true,
      plan: [
        {
          file: rel('pvt.ts'),
          ops: [{ op: 'replace_text', oldText: 'export const q = 1;', newText: 'export const q = 2;' }],
        },
      ],
    });
    check(
      '(af) transaction preview: NO OS-VALIDATED, has △ PREVIEW',
      pvT.body.preview === true &&
        !pvT.human.includes('OS-VALIDATED') &&
        pvT.human.includes('△ PREVIEW'),
      pvT.human.slice(-120),
    );

    // ── (ag) structured fields + prior directives intact (append-only) ─────
    check(
      '(ag) edit_symbol structured fields unchanged (ok/changed/file/tracePath/operationId)',
      ed.body.ok === true &&
        ed.body.changed === true &&
        ed.body.file === rel('ed.ts') &&
        typeof ed.body.tracePath === 'string' &&
        typeof ed.body.operationId === 'string' &&
        ed.human.includes('✅ Atomic edit applied') &&
        ed.human.includes('Validation:'),
      JSON.stringify({ f: ed.body.file, tp: ed.body.tracePath }),
    );
    check(
      '(ag) decompose tooldev14 TARGET-MET + STRUCTURALLY COMPLETE + verdict alongside OS line',
      typeof dec.body.completionVerdict === 'object' &&
        dec.human.includes('TASK STRUCTURALLY COMPLETE') &&
        (dec.human.includes('TARGET MET') || dec.human.includes('MINIMALLY DECOMPOSED')) &&
        dec.human.includes('OS-VALIDATED'),
      dec.human.slice(0, 90),
    );
    W('mfa.ts', 'export const m1 = 1;\n');
    W('mfb.ts', 'export const m2 = 2;\n');
    await call('atomic_replace_text', {
      file: rel('mfa.ts'),
      oldText: 'export const m1 = 1;',
      newText: 'export const m1 = 9;',
    });
    const mf2 = await call('atomic_replace_text', {
      file: rel('mfb.ts'),
      oldText: 'export const m2 = 2;',
      newText: 'export const m2 = 9;',
    });
    check(
      '(ag) tooldev25 multi-file steer still present alongside OS-VALIDATED',
      mf2.human.includes('multi-file coordinated change detected') &&
        mf2.human.includes('OS-VALIDATED'),
      mf2.human.slice(-160),
    );

    // ── (ah) regression: tooldev21/23/24 + decompose semantics still green ─
    const al = await call('code_outline', { path: rel('ed.ts') });
    check(
      '(ah) tooldev23 alias (code_outline {path}) still works',
      al.body.ok === true && Array.isArray(al.body.symbols),
      JSON.stringify({ ok: al.body.ok }),
    );
    check(
      '(ah) tooldev24 edit_symbol minimal-diff changedSpan still emitted',
      typeof ed.body.changedSpan === 'object' && ed.body.changedSpan !== null,
      JSON.stringify(ed.body.changedSpan),
    );
    check(
      '(ah) tooldev21 cross-file rename by selector still resolves + applies',
      xf.body.ok === true &&
        xf.body.changed === true &&
        (xf.body.references as number) >= 1,
      JSON.stringify({ ok: xf.body.ok, refs: xf.body.references }),
    );
    check(
      '(ah) decompose verdict + idempotency semantics intact',
      dec.body.ok === true && dec.body.changed === true && dec.body.completionVerdict != null,
    );
  } finally {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpAbs, { recursive: true, force: true });
  }
}

function partTD27(): void {
  process.stdout.write('Part TD27 — atomic-only-hook Bash leg fail-closed\n');
  const HOOK = path.join(SOURCE_DIR, 'atomic-only-hook.mjs');
  function ask(payload: unknown, raw?: string): { decision: string; reason: string } {
    const input = raw !== undefined ? raw : JSON.stringify(payload);
    try {
      const out = childProcess.execFileSync('node', [HOOK], { input, encoding: 'utf8' });
      const hso = JSON.parse(out).hookSpecificOutput ?? {};
      return {
        decision: String(hso.permissionDecision ?? ''),
        reason: String(hso.permissionDecisionReason ?? ''),
      };
    } catch (e) {
      return {
        decision: 'ERR:' + (e instanceof Error ? e.message.slice(0, 60) : String(e)),
        reason: '',
      };
    }
  }
  const bash = (command: string): { decision: string; reason: string } =>
    ask({ tool_name: 'Bash', tool_input: { command } });

  // (ai) shell mutation of a tracked code path → DENY (fail-closed)
  const deniedCmds = [
    'git show HEAD:backend/src/x.ts > backend/src/x.ts',
    'cp /tmp/k.ts backend/src/common/products/legacy-products.util.ts',
    'git stash push -q backend/src/x.ts',
    'git stash pop',
    'git checkout -- backend/src/x.ts',
    'git restore backend/src/x.ts',
    'git apply /tmp/p.patch',
    `node -e "fs.writeFileSync('src/a.ts',x)"`,
    '> backend/src/a/b/c.ts',
    `printf '...' > src/x.ts`,
  ];
  for (const c of deniedCmds) {
    const r = bash(c);
    check(
      `(ai) DENY shell mutation: ${c.slice(0, 46)}`,
      r.decision === 'deny',
      JSON.stringify({ d: r.decision }),
    );
  }

  // (aj) read-only / verify commands the atomic workers need → ALLOW
  const allowedCmds = [
    'git diff backend/src/x.ts',
    'git show HEAD:backend/src/x.ts',
    'cat src/x.ts',
    'grep -rn foo src',
    `sed -n '1,5p' src/x.ts`,
    'cd backend && npx jest src/foo.spec.ts --silent',
    'npx tsc --noEmit',
    'ls -la',
    'node dist/server.js',
  ];
  for (const c of allowedCmds) {
    const r = bash(c);
    check(
      `(aj) ALLOW read/verify: ${c.slice(0, 46)}`,
      r.decision === 'allow',
      JSON.stringify({ d: r.decision }),
    );
  }

  // (ak) native Write/Edit/MultiEdit on code still DENIED; unparseable → fail-closed
  for (const t of ['Write', 'Edit', 'MultiEdit']) {
    const r = ask({ tool_name: t, tool_input: { file_path: 'src/a.ts', content: 'x' } });
    check(`(ak) native ${t} on code → deny`, r.decision === 'deny', r.decision);
  }
  check(
    '(ak) unparseable stdin → fail-closed deny',
    ask(null, 'not-json{').decision === 'deny',
  );

  // (al) regression: mcp atomic ops pass through; prose Write still allowed
  check(
    '(al) mcp atomic op passes through (allow)',
    ask({ tool_name: 'mcp__atomic-edit__atomic_edit_symbol', tool_input: { file: 'src/a.ts' } })
      .decision === 'allow',
  );
  check(
    '(al) native Write on prose (.md) → allow',
    ask({ tool_name: 'Write', tool_input: { file_path: 'NOTES.md', content: 'x' } }).decision ===
      'allow',
  );
}

// ── Part TD28 — atomic_verify: the missing STRUCTURAL verification operator.
//    ONE macro-atomic READ-ONLY call runs jest+tsc ONCE and returns a compact
//    traced verdict, so the model never hand-runs jest/tsc in a Bash loop.
//    Fixtures use an ISOLATED git repo + a node_modules symlink to backend so
//    real jest/tsc run deterministically without polluting the repo. ─────────
async function partTD28(): Promise<void> {
  process.stdout.write('Part TD28 — atomic_verify single authoritative verification (live MCP)\n');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const repoRoot = path.resolve(SOURCE_DIR, '..', '..', '..');
  const backendNm = path.join(repoRoot, 'backend', 'node_modules');
  const tmpRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-td28.${process.pid}`);
  const tmpAbs = path.join(repoRoot, tmpRel);
  fs.rmSync(tmpAbs, { recursive: true, force: true });
  fs.mkdirSync(path.join(tmpAbs, 'src'), { recursive: true });
  let toolingAvailable = fs.existsSync(path.join(backendNm, '.bin', 'jest'));
  try {
    if (toolingAvailable) fs.symlinkSync(backendNm, path.join(tmpAbs, 'node_modules'), 'dir');
  } catch {
    toolingAvailable = false;
  }
  const W = (p: string, b: string): void => {
    fs.writeFileSync(path.join(tmpAbs, p), b);
  };
  W(
    'jest.config.cjs',
    "module.exports={rootDir:__dirname,testEnvironment:'node'," +
      "testMatch:['**/*.spec.js','**/*.test.js'],testPathIgnorePatterns:['/node_modules/']};\n",
  );
  W('pass.test.js', "test('pass',()=>{expect(1+1).toBe(2);});\n");
  W('fail.test.js', "test('fail',()=>{expect(1+1).toBe(3);});\n");
  W('clean.ts', 'export const cleanVal: number = 41 + 1;\n');
  W('bad.ts', 'export const badVal: number = "definitely not a number";\n');
  W(
    'tsconfig.clean.json',
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, skipLibCheck: true }, files: ['clean.ts'] }),
  );
  W(
    'tsconfig.bad.json',
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, skipLibCheck: true }, files: ['bad.ts'] }),
  );
  W('src/calc.js', 'function add(a,b){return a+b;}\nmodule.exports={add};\n');
  W('src/calc.spec.js', "const {add}=require('./calc');\ntest('add',()=>{expect(add(2,3)).toBe(5);});\n");
  W('.gitignore', 'node_modules\n');
  const git = (...args: string[]): void => {
    childProcess.spawnSync('git', args, { cwd: tmpAbs, encoding: 'utf8' });
  };
  git('init', '-q');
  git('config', 'user.email', 'smoke@kloel.local');
  git('config', 'user.name', 'smoke');
  git('config', 'commit.gpgsign', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['--yes', 'tsx', path.join(SOURCE_DIR, 'server.ts')],
    cwd: repoRoot,
    stderr: 'inherit',
  });
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = (await client.callTool({ name, arguments: args })) as {
      content: { text: string }[];
      isError?: boolean;
    };
    const body = JSON.parse(res.content.at(-1)?.text ?? '{}') as Record<string, unknown>;
    return { res, body, human: String(body.summaryForHuman ?? body.summary ?? '') };
  };
  const abs = (p: string): string => path.join(tmpAbs, p);
  try {
    await client.connect(transport);
    if (!toolingAvailable) {
      check('(am-aq) backend jest/tsc toolchain present for TD28 fixtures', false, 'backend/node_modules/.bin/jest missing');
      return;
    }

    // ── (am) passing spec + clean tsc → ok:true, compact verdict ────────────
    const am = await call('atomic_verify', {
      scope: 'explicit',
      specs: [abs('pass.test.js')],
      tscProject: abs('tsconfig.clean.json'),
      cwd: tmpRel,
    });
    const amJ = am.body.jest as Record<string, number | string>;
    const amT = am.body.tsc as Record<string, number | string>;
    check(
      '(am) atomic_verify pass+clean → ok:true (jest pass==total, tsc 0 err)',
      am.body.ok === true &&
        amJ.status === 'ran' &&
        amJ.fail === 0 &&
        amJ.pass === amJ.total &&
        (amJ.total as number) >= 1 &&
        amT.status === 'ran' &&
        amT.errors === 0,
      JSON.stringify({ ok: am.body.ok, j: amJ, t: amT }),
    );
    check(
      '(am) VERIFIED ✅ terminal + tracePath + compact (<4000 chars)',
      am.human.includes('VERIFIED ✅') &&
        am.human.includes('Do NOT re-run jest/tsc') &&
        typeof am.body.tracePath === 'string' &&
        (am.body.tracePath as string).includes('.atomic/traces/op_') &&
        JSON.stringify(am.body).length < 4000,
      JSON.stringify({ tp: am.body.tracePath, len: JSON.stringify(am.body).length }),
    );

    // ── (an) failing test → ok:false + ≤5 samples; tsc error → ok:false ────
    const an = await call('atomic_verify', {
      scope: 'explicit',
      specs: [abs('fail.test.js')],
      tscProject: abs('tsconfig.clean.json'),
      cwd: tmpRel,
    });
    const anJ = an.body.jest as Record<string, unknown>;
    check(
      '(an) failing spec → ok:false, jest.fail≥1, 1..5 failure samples, VERIFIED ❌',
      an.body.ok === false &&
        anJ.status === 'ran' &&
        (anJ.fail as number) >= 1 &&
        Array.isArray(anJ.failures) &&
        (anJ.failures as unknown[]).length >= 1 &&
        (anJ.failures as unknown[]).length <= 5 &&
        an.human.includes('VERIFIED ❌'),
      JSON.stringify({ ok: an.body.ok, j: anJ }),
    );
    const anT = await call('atomic_verify', {
      scope: 'explicit',
      specs: [abs('pass.test.js')],
      tscProject: abs('tsconfig.bad.json'),
      cwd: tmpRel,
    });
    const anTt = anT.body.tsc as Record<string, unknown>;
    check(
      '(an) tsc error → ok:false, tsc.errors≥1 + sample',
      anT.body.ok === false &&
        anTt.status === 'ran' &&
        (anTt.errors as number) >= 1 &&
        Array.isArray(anTt.sample) &&
        (anTt.sample as unknown[]).length >= 1,
      JSON.stringify({ ok: anT.body.ok, t: anTt }),
    );

    // ── (ao) scope:'changed' derives the affected spec from a changed src ───
    fs.writeFileSync(abs('src/calc.js'), 'function add(a,b){return a+b+0;}\nmodule.exports={add};\n');
    const ao = await call('atomic_verify', {
      scope: 'changed',
      tscProject: abs('tsconfig.clean.json'),
      cwd: tmpRel,
    });
    const aoTargets = (ao.body.targets as string[]) || [];
    check(
      '(ao) scope:changed derives calc.spec.js from changed calc.js',
      ao.body.scope === 'changed' &&
        aoTargets.some((t) => t.endsWith('calc.spec.js')) &&
        typeof ao.body.tracePath === 'string',
      JSON.stringify({ scope: ao.body.scope, targets: aoTargets }),
    );

    // ── (ap) idempotent FREE re-call + graceful degrade + tooldev26 line ───
    const ap1 = await call('atomic_verify', {
      scope: 'explicit',
      specs: [abs('pass.test.js')],
      tscProject: abs('tsconfig.clean.json'),
      cwd: tmpRel,
    });
    const ap2 = await call('atomic_verify', {
      scope: 'explicit',
      specs: [abs('pass.test.js')],
      tscProject: abs('tsconfig.clean.json'),
      cwd: tmpRel,
    });
    check(
      '(ap) idempotent re-call returns a verdict again, cached & FREE, no crash',
      ap1.body.ok === true &&
        ap2.body.ok === true &&
        ap2.body.cached === true &&
        ap2.human.toLowerCase().includes('cached'),
      JSON.stringify({ c1: ap1.body.cached, c2: ap2.body.cached }),
    );
    fs.mkdirSync(abs('broke'), { recursive: true });
    fs.writeFileSync(abs('broke/jest.config.cjs'), "throw new Error('intentional-broken-jest-config');\n");
    fs.writeFileSync(abs('broke/x.test.js'), "test('x',()=>{expect(1).toBe(1);});\n");
    try {
      fs.symlinkSync(backendNm, abs('broke/node_modules'), 'dir');
    } catch {
      /* ignore */
    }
    const apd = await call('atomic_verify', {
      scope: 'explicit',
      specs: [path.join(abs('broke'), 'x.test.js')],
      tscProject: abs('tsconfig.clean.json'),
      cwd: path.join(tmpRel, 'broke'),
    });
    const apdJ = apd.body.jest as Record<string, unknown>;
    check(
      '(ap) broken jest config degrades to status:skipped — never throws/crashes',
      apdJ.status === 'skipped' &&
        typeof apd.human === 'string' &&
        apd.human.includes('VERIFIED'),
      JSON.stringify({ j: apdJ, ok: apd.body.ok }),
    );
    fs.writeFileSync(abs('ov.ts'), 'export function g(x: number): number {\n  return x;\n}\n');
    const ov = await call('atomic_edit_symbol', {
      file: path.join(tmpRel, 'ov.ts'),
      selector: 'g',
      op: 'replace',
      code: 'export function g(x: number): number {\n  return x + 1;\n}',
    });
    const osLines = ov.human.split('\n').filter((l) => l.includes('OS-VALIDATED'));
    const osLine = osLines[0] ?? '';
    check(
      '(ap) tooldev26 OS-VALIDATED line now NAMES atomic_verify (1 line, ≤240, trace)',
      osLines.length === 1 &&
        osLine.length <= 240 &&
        osLine.includes('mcp__atomic-edit__atomic_verify') &&
        osLine.includes('do NOT hand-run jest/tsc/grep') &&
        osLine.includes('.atomic/traces/op_'),
      JSON.stringify({ n: osLines.length, len: osLine.length, line: osLine.slice(0, 90) }),
    );

    // ── (aq) regression: hook allows atomic_verify; decompose still green ───
    const HOOK = path.join(SOURCE_DIR, 'atomic-only-hook.mjs');
    const ask = (payload: unknown): string => {
      try {
        const out = childProcess.execFileSync('node', [HOOK], {
          input: JSON.stringify(payload),
          encoding: 'utf8',
        });
        const hso = JSON.parse(out).hookSpecificOutput ?? {};
        return String(hso.permissionDecision ?? '');
      } catch {
        return 'ERR';
      }
    };
    check(
      '(aq) atomic_verify passes the atomic-only hook (allow, not denied)',
      ask({ tool_name: 'mcp__atomic-edit__atomic_verify', tool_input: { scope: 'changed' } }) === 'allow',
    );
    fs.writeFileSync(
      abs('dq.ts'),
      ['export function aa(): number { return 1; }', 'export function bb(): number { return 2; }', 'export const cc = aa() + bb();', ''].join('\n'),
    );
    const dq = await call('atomic_decompose_file', {
      file: path.join(tmpRel, 'dq.ts'),
      plan: [{ symbols: ['aa', 'bb'], newModule: path.join(tmpRel, 'dq.part.ts') }],
    });
    check(
      '(aq) regression: decompose still green + OS line references atomic_verify',
      dq.body.ok === true &&
        dq.body.changed === true &&
        dq.human.includes('OS-VALIDATED') &&
        dq.human.includes('mcp__atomic-edit__atomic_verify'),
      JSON.stringify({ ok: dq.body.ok, changed: dq.body.changed }),
    );
  } finally {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpAbs, { recursive: true, force: true });
  }
}

async function partTD29(): Promise<void> {
  process.stdout.write(
    'Part TD29 — cross-file rename completes the require()/jest.mock() forms\n',
  );
  const repoRoot = path.resolve(SOURCE_DIR, '..', '..', '..');
  const TSCONFIG = JSON.stringify({
    compilerOptions: {
      strict: false,
      noEmit: true,
      allowJs: true,
      module: 'commonjs',
      moduleResolution: 'node',
      esModuleInterop: true,
    },
    include: ['*.ts'],
  });
  const mkTmp = (tag: string): string => {
    const rel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-td29-${tag}.${process.pid}`);
    const abs = path.join(repoRoot, rel);
    fs.rmSync(abs, { recursive: true, force: true });
    fs.mkdirSync(abs, { recursive: true });
    return abs;
  };
  const W = (abs: string, name: string, body: string): void => {
    fs.writeFileSync(path.join(abs, name), body);
  };

  // ── (ar) require destructure + jest.mock factory property, both resolving
  //        to the def file → ONE call renames def + both, residual empty ──────
  {
    const t = mkTmp('ar');
    try {
      W(t, 'tsconfig.json', TSCONFIG);
      W(t, 'util.ts', 'export function foo(seed: number) {\n  return seed + 1;\n}\n');
      W(t, 'consumer.ts', "import { foo } from './util';\nexport const z = foo(2);\n");
      W(
        t,
        'a.spec.ts',
        [
          "jest.mock('./util', () => ({ foo: jest.fn() }));",
          "const { foo } = require('./util');",
          "describe('suite', () => {",
          "  it('works', () => {",
          '    expect(foo).toBeDefined();',
          '  });',
          '});',
          '',
        ].join('\n'),
      );
      const r = await renameSymbolCrossFile(path.join(t, 'util.ts'), repoRoot, 1, 17, 'bar');
      const get = (n: string): string =>
        [...r.changes.entries()].find(([k]) => k.endsWith(n))?.[1] ?? '';
      const spec = get('a.spec.ts');
      const util = get('util.ts');
      check(
        '(ar) require()+jest.mock() forms renamed in ONE call, residual empty',
        r.residualUnresolved.length === 0 &&
          r.validations.every((v) => v.ok) &&
          /export function bar\b/.test(util) &&
          /jest\.mock\('\.\/util'/.test(spec) &&
          /\{\s*bar:\s*jest\.fn\(\)\s*\}/.test(spec) &&
          /const\s*\{\s*bar\s*\}\s*=\s*require\('\.\/util'\)/.test(spec) &&
          /expect\(bar\)/.test(spec) &&
          !/\bfoo\b/.test(spec),
        JSON.stringify({ residual: r.residualUnresolved, spec }),
      );
      check(
        '(ar) consumer import + def still type-renamed (td22 byte-identical)',
        /import \{ bar \} from ['"]\.\/util['"]/.test(get('consumer.ts')) &&
          /\bbar\(2\)/.test(get('consumer.ts')),
        get('consumer.ts'),
      );
    } finally {
      fs.rmSync(t, { recursive: true, force: true });
    }
  }

  // ── (as) precision: a DIFFERENT module's mock/require, an unrelated object,
  //        a describe() string and obj.foo are ALL byte-unchanged ────────────
  {
    const t = mkTmp('as');
    try {
      W(t, 'tsconfig.json', TSCONFIG);
      W(t, 'util.ts', 'export function foo(seed: number) {\n  return seed + 1;\n}\n');
      W(t, 'realref.ts', "import { foo } from './util';\nexport const z = foo(7);\n");
      W(
        t,
        'noise.spec.ts',
        [
          "jest.mock('other-mod', () => ({ foo: 1 }));",
          "const { foo } = require('other-mod');",
          'const obj = { foo: 99 };',
          "describe('foo', () => {});",
          'export const sink = obj.foo + foo;',
          '',
        ].join('\n'),
      );
      const before = fs.readFileSync(path.join(t, 'noise.spec.ts'), 'utf8');
      const r = await renameSymbolCrossFile(path.join(t, 'util.ts'), repoRoot, 1, 17, 'bar');
      const noiseChanged = [...r.changes.keys()].some((k) => k.endsWith('noise.spec.ts'));
      const realChanged = [...r.changes.entries()].find(([k]) => k.endsWith('realref.ts'))?.[1] ?? '';
      check(
        '(as) unrelated module/object/string/describe ALL byte-unchanged',
        !noiseChanged &&
          r.residualUnresolved.length === 0 &&
          r.validations.every((v) => v.ok) &&
          before.includes("jest.mock('other-mod'") &&
          /import \{ bar \} from ['"]\.\/util['"]/.test(realChanged),
        JSON.stringify({ noiseChanged, residual: r.residualUnresolved }),
      );
    } finally {
      fs.rmSync(t, { recursive: true, force: true });
    }
  }

  // ── (at) shorthand `{ foo }` in factory + `{ foo: localAlias }` require:
  //        key renamed, alias preserved, unrelated local `foo` untouched ─────
  {
    const t = mkTmp('at');
    try {
      W(t, 'tsconfig.json', TSCONFIG);
      W(t, 'util.ts', 'export function foo(seed: number) {\n  return seed + 1;\n}\n');
      W(t, 'consumer.ts', "import { foo } from './util';\nexport const z = foo(3);\n");
      W(
        t,
        'b.spec.ts',
        [
          'const foo = jest.fn();',
          "jest.mock('./util', () => ({ foo }));",
          "const { foo: localAlias } = require('./util');",
          "describe('suite', () => {",
          "  it('works', () => {",
          '    expect(localAlias).toBe(foo);',
          '  });',
          '});',
          '',
        ].join('\n'),
      );
      const r = await renameSymbolCrossFile(path.join(t, 'util.ts'), repoRoot, 1, 17, 'bar');
      const spec =
        [...r.changes.entries()].find(([k]) => k.endsWith('b.spec.ts'))?.[1] ?? '';
      check(
        '(at) factory shorthand→{ bar }, require key→bar, alias+local foo intact',
        r.residualUnresolved.length === 0 &&
          r.validations.every((v) => v.ok) &&
          /=>\s*\(\{\s*bar\s*\}\)/.test(spec) &&
          /const\s*\{\s*bar:\s*localAlias\s*\}\s*=\s*require\('\.\/util'\)/.test(spec) &&
          spec.includes('const foo = jest.fn();') &&
          /expect\(localAlias\)\.toBe\(foo\)/.test(spec),
        JSON.stringify({ residual: r.residualUnresolved, spec }),
      );
    } finally {
      fs.rmSync(t, { recursive: true, force: true });
    }
  }

  // ── (au) regression: a plain td21/td22 import rename with NO require/mock
  //        forms present is byte-identical (new code path provably inert) ────
  {
    const t = mkTmp('au');
    try {
      W(t, 'tsconfig.json', TSCONFIG);
      W(t, 'a.ts', 'export function compute(seed: number) {\n  return seed + 1;\n}\n');
      W(t, 'b.ts', "import { compute } from './a';\nexport const r = compute(41);\n");
      const r = await renameSymbolCrossFile(path.join(t, 'a.ts'), repoRoot, 1, 17, 'calculate');
      const vals = [...r.changes.values()];
      check(
        '(au) plain cross-file rename unaffected (td21/td22 green, inert path)',
        vals.length === 2 &&
          r.residualUnresolved.length === 0 &&
          r.validations.every((v) => v.ok) &&
          vals.every((c) => c.includes('calculate') && !/\bcompute\b/.test(c)),
        JSON.stringify({ n: vals.length, residual: r.residualUnresolved }),
      );
    } finally {
      fs.rmSync(t, { recursive: true, force: true });
    }
  }

  // ── (bd) tooldev32: ONE selector rename `Svc.log`→record covers def + ALL
  //        NestJS DI provider-mock forms (useValue obj, useFactory return obj,
  //        const-indirection obj + its m.log uses); residual empty ───────────
  {
    const t = mkTmp('bd');
    try {
      W(t, 'tsconfig.json', TSCONFIG);
      W(
        t,
        'svc.ts',
        'export class Svc {\n  log() {\n    return 1;\n  }\n}\n',
      );
      W(
        t,
        'svc.spec.ts',
        [
          "import { Test } from '@nestjs/testing';",
          "import { Svc } from './svc';",
          '',
          'const m = { log: jest.fn() };',
          '',
          "describe('Svc mocks', () => {",
          "  it('useValue obj', async () => {",
          '    await Test.createTestingModule({',
          '      providers: [{ provide: Svc, useValue: { log: jest.fn() } }],',
          '    }).compile();',
          '  });',
          "  it('useFactory', async () => {",
          '    await Test.createTestingModule({',
          '      providers: [{ provide: Svc, useFactory: () => ({ log: jest.fn() }) }],',
          '    }).compile();',
          '  });',
          "  it('indirection', async () => {",
          '    await Test.createTestingModule({',
          '      providers: [{ provide: Svc, useValue: m }],',
          '    }).compile();',
          '    m.log();',
          '  });',
          '});',
          '',
        ].join('\n'),
      );
      const r = await renameSymbolCrossFile(path.join(t, 'svc.ts'), repoRoot, 2, 3, 'record');
      const get = (n: string): string =>
        [...r.changes.entries()].find(([k]) => k.endsWith(n))?.[1] ?? '';
      const svc = get('svc.ts');
      const spec = get('svc.spec.ts');
      check(
        '(bd) ONE rename covers def + useValue/useFactory/indirection mock keys + m.log',
        r.residualUnresolved.length === 0 &&
          r.validations.every((v) => v.ok) &&
          /\brecord\(\)/.test(svc) &&
          !/\blog\b/.test(svc) &&
          /useValue:\s*\{\s*record:\s*jest\.fn\(\)\s*\}/.test(spec) &&
          /useFactory:\s*\(\)\s*=>\s*\(\{\s*record:\s*jest\.fn\(\)\s*\}\)/.test(spec) &&
          /const m = \{ record: jest\.fn\(\) \};/.test(spec) &&
          /\bm\.record\(\)/.test(spec) &&
          !/\blog\b/.test(spec),
        JSON.stringify({ residual: r.residualUnresolved, spec }),
      );
    } finally {
      fs.rmSync(t, { recursive: true, force: true });
    }
  }

  // ── (be) precision: a DIFFERENT class's own provider mock, console.log, a
  //        describe('log') string and an unrelated { log: 1 } are byte-exact ─
  {
    const t = mkTmp('be');
    try {
      W(t, 'tsconfig.json', TSCONFIG);
      W(t, 'svc.ts', 'export class Svc {\n  log() {\n    return 1;\n  }\n}\n');
      W(t, 'other.ts', 'export class Other {\n  log() {\n    return 2;\n  }\n}\n');
      W(
        t,
        'real.spec.ts',
        [
          "import { Test } from '@nestjs/testing';",
          "import { Svc } from './svc';",
          "describe('real', () => {",
          "  it('uses Svc', async () => {",
          '    await Test.createTestingModule({',
          '      providers: [{ provide: Svc, useValue: { log: jest.fn() } }],',
          '    }).compile();',
          '  });',
          '});',
          '',
        ].join('\n'),
      );
      W(
        t,
        'noise.spec.ts',
        [
          "import { Other } from './other';",
          'const conf = { provide: Other, useValue: { log: jest.fn() } };',
          "console.log('hi');",
          "describe('log', () => {});",
          'const unrelated = { log: 1 };',
          'export const sink = [conf, unrelated];',
          '',
        ].join('\n'),
      );
      const noiseBefore = fs.readFileSync(path.join(t, 'noise.spec.ts'), 'utf8');
      const otherBefore = fs.readFileSync(path.join(t, 'other.ts'), 'utf8');
      const r = await renameSymbolCrossFile(path.join(t, 'svc.ts'), repoRoot, 2, 3, 'record');
      const changedKeys = [...r.changes.keys()];
      const noiseChanged = changedKeys.some((k) => k.endsWith('noise.spec.ts'));
      const otherChanged = changedKeys.some((k) => k.endsWith('other.ts'));
      const real =
        [...r.changes.entries()].find(([k]) => k.endsWith('real.spec.ts'))?.[1] ?? '';
      check(
        '(be) different class mock + console.log + describe string + { log:1 } byte-exact',
        !noiseChanged &&
          !otherChanged &&
          r.residualUnresolved.length === 0 &&
          r.validations.every((v) => v.ok) &&
          noiseBefore === fs.readFileSync(path.join(t, 'noise.spec.ts'), 'utf8') &&
          otherBefore === fs.readFileSync(path.join(t, 'other.ts'), 'utf8') &&
          /useValue:\s*\{\s*record:\s*jest\.fn\(\)\s*\}/.test(real),
        JSON.stringify({ noiseChanged, otherChanged, residual: r.residualUnresolved }),
      );
    } finally {
      fs.rmSync(t, { recursive: true, force: true });
    }
  }

  // ── (bf) combined: td29 jest.mock factory + td22 ES-import + require()
  //        destructure all still covered in the SAME call, residual empty ────
  {
    const t = mkTmp('bf');
    try {
      W(t, 'tsconfig.json', TSCONFIG);
      W(t, 'util.ts', 'export function foo(seed: number) {\n  return seed + 1;\n}\n');
      W(t, 'consumer.ts', "import { foo } from './util';\nexport const z = foo(9);\n");
      W(
        t,
        'combo.spec.ts',
        [
          "import { foo } from './util';",
          "jest.mock('./util', () => ({ foo: jest.fn() }));",
          "const { foo: aliased } = require('./util');",
          "describe('combo', () => {",
          "  it('all forms', () => {",
          '    expect(foo).toBeDefined();',
          '    expect(aliased).toBeDefined();',
          '  });',
          '});',
          '',
        ].join('\n'),
      );
      const r = await renameSymbolCrossFile(path.join(t, 'util.ts'), repoRoot, 1, 17, 'bar');
      const get = (n: string): string =>
        [...r.changes.entries()].find(([k]) => k.endsWith(n))?.[1] ?? '';
      const spec = get('combo.spec.ts');
      check(
        '(bf) jest.mock + ES-import + require destructure all renamed, residual empty',
        r.residualUnresolved.length === 0 &&
          r.validations.every((v) => v.ok) &&
          /export function bar\b/.test(get('util.ts')) &&
          /import \{ bar \} from ['"]\.\/util['"]/.test(spec) &&
          /\{\s*bar:\s*jest\.fn\(\)\s*\}/.test(spec) &&
          /const\s*\{\s*bar:\s*aliased\s*\}\s*=\s*require\('\.\/util'\)/.test(spec) &&
          /expect\(bar\)/.test(spec) &&
          !/\bfoo\b/.test(spec),
        JSON.stringify({ residual: r.residualUnresolved, spec }),
      );
    } finally {
      fs.rmSync(t, { recursive: true, force: true });
    }
  }

  // ── (bg) regression: a plain top-level fn rename with NO provider/mock
  //        forms present is byte-identical (td32 path provably inert) ────────
  {
    const t = mkTmp('bg');
    try {
      W(t, 'tsconfig.json', TSCONFIG);
      W(t, 'a.ts', 'export function compute(seed: number) {\n  return seed + 1;\n}\n');
      W(t, 'b.ts', "import { compute } from './a';\nexport const r = compute(41);\n");
      const r = await renameSymbolCrossFile(path.join(t, 'a.ts'), repoRoot, 1, 17, 'calculate');
      const vals = [...r.changes.values()];
      check(
        '(bg) plain cross-file rename unaffected (td32 path inert)',
        vals.length === 2 &&
          r.residualUnresolved.length === 0 &&
          r.validations.every((v) => v.ok) &&
          vals.every((c) => c.includes('calculate') && !/\bcompute\b/.test(c)),
        JSON.stringify({ n: vals.length, residual: r.residualUnresolved }),
      );
    } finally {
      fs.rmSync(t, { recursive: true, force: true });
    }
  }
}

// ── Part TD30 — atomic_verify keeps its superior blast-radius completeness
//    but absorbs Normal's speed: PARALLEL jest for the multi-spec radius +
//    INCREMENTAL tsc — WITHOUT under-verifying. Coverage / targets / verdict
//    stay byte-identical to the serial run; only wall-time drops. The chosen
//    jest/tsc argv is observable only under ATOMIC_VERIFY_DEBUG_ARGV=1, so the
//    default verdict object is byte-identical to pre-td30. ─────────────────
async function partTD30(): Promise<void> {
  process.stdout.write('Part TD30 — atomic_verify parallel jest + incremental tsc (live MCP)\n');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const repoRoot = path.resolve(SOURCE_DIR, '..', '..', '..');
  const backendNm = path.join(repoRoot, 'backend', 'node_modules');
  const tmpRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-td30.${process.pid}`);
  const tmpAbs = path.join(repoRoot, tmpRel);
  fs.rmSync(tmpAbs, { recursive: true, force: true });
  fs.mkdirSync(path.join(tmpAbs, 'src'), { recursive: true });
  let toolingAvailable = fs.existsSync(path.join(backendNm, '.bin', 'jest'));
  try {
    if (toolingAvailable) fs.symlinkSync(backendNm, path.join(tmpAbs, 'node_modules'), 'dir');
  } catch {
    toolingAvailable = false;
  }
  const W = (p: string, b: string): void => {
    fs.writeFileSync(path.join(tmpAbs, p), b);
  };
  W(
    'jest.config.cjs',
    "module.exports={rootDir:__dirname,testEnvironment:'node'," +
      "testMatch:['**/*.spec.js','**/*.test.js'],testPathIgnorePatterns:['/node_modules/']};\n",
  );
  W('a.test.js', "test('a1',()=>{expect(1).toBe(1);});\ntest('a2',()=>{expect(2).toBe(2);});\n");
  W('b.test.js', "test('b1',()=>{expect(3).toBe(3);});\n");
  W('clean.ts', 'export const cleanVal: number = 41 + 1;\n');
  W('bad.ts', 'export const badVal: number = "definitely not a number";\n');
  W(
    'tsconfig.clean.json',
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, skipLibCheck: true }, files: ['clean.ts'] }),
  );
  W(
    'tsconfig.bad.json',
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, skipLibCheck: true }, files: ['bad.ts'] }),
  );
  W('src/calc.js', 'function add(a,b){return a+b;}\nmodule.exports={add};\n');
  W('src/calc.spec.js', "const {add}=require('./calc');\ntest('add',()=>{expect(add(2,3)).toBe(5);});\n");
  W('.gitignore', 'node_modules\n');
  const git = (...args: string[]): void => {
    childProcess.spawnSync('git', args, { cwd: tmpAbs, encoding: 'utf8' });
  };
  git('init', '-q');
  git('config', 'user.email', 'smoke@kloel.local');
  git('config', 'user.name', 'smoke');
  git('config', 'commit.gpgsign', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const abs = (p: string): string => path.join(tmpAbs, p);

  type SmokeClient = {
    callTool(a: { name: string; arguments: Record<string, unknown> }): Promise<{ content: { text: string }[] }>;
    connect(t: unknown): Promise<void>;
    close(): Promise<void>;
  };
  const mkClient = async (debug: boolean): Promise<SmokeClient> => {
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['--yes', 'tsx', path.join(SOURCE_DIR, 'server.ts')],
      cwd: repoRoot,
      stderr: 'inherit',
      ...(debug
        ? { env: { ...process.env, ATOMIC_VERIFY_DEBUG_ARGV: '1' } as Record<string, string> }
        : {}),
    });
    const client = new Client({ name: 'smoke', version: '1.0.0' }) as unknown as SmokeClient;
    await client.connect(transport);
    return client;
  };
  const callOn = async (
    client: SmokeClient,
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ body: Record<string, unknown>; human: string }> => {
    const res = await client.callTool({ name, arguments: args });
    const body = JSON.parse(res.content.at(-1)?.text ?? '{}') as Record<string, unknown>;
    return { body, human: String(body.summaryForHuman ?? body.summary ?? '') };
  };

  if (!toolingAvailable) {
    check('(av-ay) backend jest/tsc toolchain present for TD30 fixtures', false, 'backend/node_modules/.bin/jest missing');
    fs.rmSync(tmpAbs, { recursive: true, force: true });
    return;
  }

  const dbg = await mkClient(true);
  try {
    // ── (av) >1 jest target → parallel: NO --runInBand, HAS --maxWorkers;
    //        aggregate counts == serial reference (sum of single-target runs).
    const multi = await callOn(dbg, 'atomic_verify', {
      scope: 'explicit',
      specs: [abs('a.test.js'), abs('b.test.js')],
      tscProject: abs('tsconfig.clean.json'),
      cwd: tmpRel,
    });
    const mJ = multi.body.jest as Record<string, number | string>;
    const jArgv = (multi.body._debugJestArgv as string[]) || [];
    const r1 = await callOn(dbg, 'atomic_verify', {
      scope: 'explicit',
      specs: [abs('a.test.js')],
      tscProject: abs('tsconfig.clean.json'),
      cwd: tmpRel,
    });
    const r2 = await callOn(dbg, 'atomic_verify', {
      scope: 'explicit',
      specs: [abs('b.test.js')],
      tscProject: abs('tsconfig.clean.json'),
      cwd: tmpRel,
    });
    const s1 = r1.body.jest as Record<string, number>;
    const s2 = r2.body.jest as Record<string, number>;
    check(
      '(av) >1 jest target → argv has --maxWorkers, NO --runInBand',
      Array.isArray(jArgv) &&
        jArgv.some((x) => x.startsWith('--maxWorkers')) &&
        !jArgv.includes('--runInBand'),
      JSON.stringify(jArgv),
    );
    check(
      '(av) parallel aggregate == serial reference (coverage byte-identical, only wall-time drops)',
      multi.body.ok === true &&
        mJ.status === 'ran' &&
        Number(mJ.total) === Number(s1.total) + Number(s2.total) &&
        Number(mJ.pass) === Number(s1.pass) + Number(s2.pass) &&
        Number(mJ.fail) === 0 &&
        Number(mJ.total) >= 3,
      JSON.stringify({ m: mJ, s1, s2 }),
    );

    // ── (aw) single target → still --runInBand, never --maxWorkers ─────────
    const single = await callOn(dbg, 'atomic_verify', {
      scope: 'explicit',
      specs: [abs('a.test.js')],
      tscProject: abs('tsconfig.clean.json'),
      cwd: tmpRel,
    });
    const sArgv = (single.body._debugJestArgv as string[]) || [];
    check(
      '(aw) single jest target → argv keeps --runInBand, no --maxWorkers (unchanged)',
      Array.isArray(sArgv) &&
        sArgv.includes('--runInBand') &&
        !sArgv.some((x) => x.startsWith('--maxWorkers')),
      JSON.stringify(sArgv),
    );

    // ── (ax) incremental tsc + .atomic/*.tsbuildinfo; reuse not slower;
    //        identical error parsing; predicate must NOT misfire on a real
    //        type error (that false fallback would mask failures + 2× cost). ─
    const buildInfo = path.join(repoRoot, '.atomic', 'tsc-verify.tsbuildinfo');
    const tArgv1 = (single.body._debugTscArgv as string[]) || [];
    const inc1 = single.body._debugTscIncremental === true;
    const buildInfoExists = fs.existsSync(buildInfo);
    fs.writeFileSync(abs('clean.ts'), 'export const cleanVal: number = 41 + 2;\n');
    const t0 = Date.now();
    const ax2 = await callOn(dbg, 'atomic_verify', {
      scope: 'explicit',
      specs: [abs('a.test.js')],
      tscProject: abs('tsconfig.clean.json'),
      cwd: tmpRel,
    });
    const ax2Dur = Date.now() - t0;
    const tA1 = single.body.tsc as Record<string, unknown>;
    const tA2 = ax2.body.tsc as Record<string, unknown>;
    check(
      '(ax) tsc argv has --incremental + .atomic/*.tsbuildinfo, buildinfo created, incremental=true',
      Array.isArray(tArgv1) &&
        tArgv1.includes('--incremental') &&
        tArgv1.includes('--tsBuildInfoFile') &&
        tArgv1.some(
          (x) => x.endsWith('.tsbuildinfo') && x.includes(`${path.sep}.atomic${path.sep}`),
        ) &&
        inc1 === true &&
        buildInfoExists === true,
      JSON.stringify({ tArgv1, inc1, buildInfoExists }),
    );
    check(
      '(ax) 2nd call reuses buildinfo: identical error parsing (0/0) and not slower',
      tA1.status === 'ran' &&
        tA2.status === 'ran' &&
        Number(tA1.errors) === Number(tA2.errors) &&
        Number(tA1.errors) === 0 &&
        ax2Dur <= 120000,
      JSON.stringify({ e1: tA1.errors, e2: tA2.errors, ax2Dur }),
    );
    const axBad = await callOn(dbg, 'atomic_verify', {
      scope: 'explicit',
      specs: [abs('a.test.js')],
      tscProject: abs('tsconfig.bad.json'),
      cwd: tmpRel,
    });
    const tBad = axBad.body.tsc as Record<string, unknown>;
    check(
      '(ax) genuine tsc error → NO false fallback (stays incremental, error surfaced, no throw)',
      axBad.body._debugTscIncremental === true &&
        tBad.status === 'ran' &&
        Number(tBad.errors) >= 1 &&
        axBad.human.includes('VERIFIED'),
      JSON.stringify({ inc: axBad.body._debugTscIncremental, t: tBad }),
    );
  } finally {
    try {
      await dbg.close();
    } catch {
      /* ignore */
    }
  }

  // ── (ay) DEFAULT env (no debug) → verdict object byte-identical to
  //        pre-td30: exact key set, zero _debug*, VERIFIED terminal,
  //        scope=changed blast-radius derivation unchanged. ────────────────
  const plain = await mkClient(false);
  try {
    fs.writeFileSync(abs('src/calc.js'), 'function add(a,b){return a+b+0;}\nmodule.exports={add};\n');
    const ay = await callOn(plain, 'atomic_verify', {
      scope: 'changed',
      tscProject: abs('tsconfig.clean.json'),
      cwd: tmpRel,
    });
    const keys = Object.keys(ay.body).sort();
    const expected = [
      'cached',
      'durationMs',
      'jest',
      'ok',
      'scope',
      'summary',
      'summaryForHuman',
      'targets',
      'tracePath',
      'tsc',
    ].sort();
    const tgts = (ay.body.targets as string[]) || [];
    check(
      '(ay) default verdict object byte-identical pre-td30: exact key set, zero _debug*',
      JSON.stringify(keys) === JSON.stringify(expected) && !keys.some((k) => k.startsWith('_debug')),
      JSON.stringify(keys),
    );
    check(
      '(ay) scope=changed blast-radius derivation + VERIFIED terminal unchanged',
      ay.body.scope === 'changed' &&
        tgts.some((t) => t.endsWith('calc.spec.js')) &&
        ay.human.includes('VERIFIED') &&
        ay.human.includes('Do NOT re-run jest/tsc') &&
        typeof ay.body.tracePath === 'string',
      JSON.stringify({ scope: ay.body.scope, targets: tgts }),
    );
  } finally {
    try {
      await plain.close();
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpAbs, { recursive: true, force: true });
  }
}

// ── Part TD31 — atomic_verify's tsc verdict is DELTA/ISLAND-aware. Every real
//    repo carries pre-existing tsc noise; counting the WHOLE-REPO total made
//    atomic_verify false-❌ on a clean change and triggered a wasteful
//    re-verify loop (R49). A tsc error blocks ONLY when the change INTRODUCED
//    it; pre-existing unrelated errors are reported but never gate. ──────────
async function partTD31(): Promise<void> {
  process.stdout.write('Part TD31 — atomic_verify delta/island-aware tsc verdict (live MCP)\n');
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const repoRoot = path.resolve(SOURCE_DIR, '..', '..', '..');
  const backendNm = path.join(repoRoot, 'backend', 'node_modules');
  const tmpRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-td31.${process.pid}`);
  const tmpAbs = path.join(repoRoot, tmpRel);
  fs.rmSync(tmpAbs, { recursive: true, force: true });
  fs.mkdirSync(path.join(tmpAbs, 'src'), { recursive: true });
  let toolingAvailable = fs.existsSync(path.join(backendNm, '.bin', 'jest'));
  try {
    if (toolingAvailable) fs.symlinkSync(backendNm, path.join(tmpAbs, 'node_modules'), 'dir');
  } catch {
    toolingAvailable = false;
  }
  const W = (p: string, b: string): void => {
    fs.writeFileSync(path.join(tmpAbs, p), b);
  };
  W(
    'jest.config.cjs',
    "module.exports={rootDir:__dirname,testEnvironment:'node'," +
      "testMatch:['**/*.spec.js','**/*.test.js'],testPathIgnorePatterns:['/node_modules/']};\n",
  );
  W('src/calc.js', 'function add(a,b){return a+b;}\nmodule.exports={add};\n');
  W('src/calc.spec.js', "const {add}=require('./calc');\ntest('add',()=>{expect(add(2,3)).toBe(5);});\n");
  // pre-existing, UNRELATED tsc error in an untouched file (committed at base)
  W('preexist.ts', 'export const preBad: number = "pre-existing unrelated string";\n');
  W('inj.ts', 'export const injVal: number = 1;\n');
  W(
    'tsconfig.az.json',
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, skipLibCheck: true },
      files: ['preexist.ts', 'inj.ts'],
    }),
  );
  W('.gitignore', 'node_modules\n');
  const git = (...args: string[]): void => {
    childProcess.spawnSync('git', args, { cwd: tmpAbs, encoding: 'utf8' });
  };
  git('init', '-q');
  git('config', 'user.email', 'smoke@kloel.local');
  git('config', 'user.name', 'smoke');
  git('config', 'commit.gpgsign', 'false');
  git('add', '-A');
  git('commit', '-q', '-m', 'base');
  const abs = (p: string): string => path.join(tmpAbs, p);
  const baselineFile = path.join(repoRoot, '.atomic', 'tsc-baseline.json');

  const transport = new StdioClientTransport({
    command: 'npx',
    args: ['--yes', 'tsx', path.join(SOURCE_DIR, 'server.ts')],
    cwd: repoRoot,
    stderr: 'inherit',
  });
  const client = new Client({ name: 'smoke', version: '1.0.0' });
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = (await client.callTool({ name, arguments: args })) as {
      content: { text: string }[];
      isError?: boolean;
    };
    const body = JSON.parse(res.content.at(-1)?.text ?? '{}') as Record<string, unknown>;
    return { res, body, human: String(body.summaryForHuman ?? body.summary ?? '') };
  };
  try {
    await client.connect(transport);
    if (!toolingAvailable) {
      check('(az-bc) backend jest/tsc toolchain present for TD31 fixtures', false, 'backend/node_modules/.bin/jest missing');
      return;
    }

    // ── (az) clean change + PRE-EXISTING unrelated tsc error → ✅ FIRST call ─
    fs.writeFileSync(abs('src/calc.js'), 'function add(a,b){return a+b+0;}\nmodule.exports={add};\n');
    const az = await call('atomic_verify', { scope: 'changed', tscProject: abs('tsconfig.az.json'), cwd: tmpRel });
    const azT = az.body.tsc as Record<string, number | string>;
    check(
      '(az) pre-existing unrelated tsc error + clean jest → ok:true, tsc.introduced===0, preExisting≥1, single authoritative ✅',
      az.body.ok === true &&
        azT.status === 'ran' &&
        azT.introduced === 0 &&
        (azT.preExisting as number) >= 1 &&
        az.body.cached !== true &&
        az.human.includes('VERIFIED ✅') &&
        az.human.includes('pre-existing unrelated (not blocking)') &&
        az.human.includes('Do NOT re-run jest/tsc') &&
        az.human.includes('this is the proof'),
      JSON.stringify({ ok: az.body.ok, t: azT, cached: az.body.cached }),
    );

    // ── (ba) a change that INTRODUCES a tsc error in a changed file → ❌ ────
    git('checkout', '--', 'src/calc.js');
    fs.writeFileSync(abs('inj.ts'), 'export const injVal: number = "boom not a number";\n');
    const ba = await call('atomic_verify', { scope: 'changed', tscProject: abs('tsconfig.az.json'), cwd: tmpRel });
    const baT = ba.body.tsc as Record<string, unknown>;
    const baSample = (baT.sample as string[]) || [];
    check(
      '(ba) introduced tsc error in changed file → ok:false, introduced≥1, sample = the INTRODUCED error (not the pre-existing one)',
      ba.body.ok === false &&
        baT.status === 'ran' &&
        (baT.introduced as number) >= 1 &&
        baSample.length >= 1 &&
        baSample[0].includes('inj') &&
        !baSample[0].includes('preexist') &&
        ba.human.includes('VERIFIED ❌'),
      JSON.stringify({ ok: ba.body.ok, t: baT }),
    );

    // ── (bb) jest failing + tsc all-pre-existing → ok:false (jest gates),
    //        introduced===0 (don't misattribute the pre-existing error) ──────
    git('checkout', '--', 'inj.ts');
    fs.writeFileSync(abs('src/calc.js'), 'function add(a,b){return a+b+1;}\nmodule.exports={add};\n');
    const bb = await call('atomic_verify', { scope: 'changed', tscProject: abs('tsconfig.az.json'), cwd: tmpRel });
    const bbJ = bb.body.jest as Record<string, unknown>;
    const bbT = bb.body.tsc as Record<string, unknown>;
    check(
      '(bb) jest fail + only pre-existing tsc → ok:false (jest gates), tsc.introduced===0, preExisting≥1',
      bb.body.ok === false &&
        bbJ.status === 'ran' &&
        (bbJ.fail as number) >= 1 &&
        bbT.status === 'ran' &&
        bbT.introduced === 0 &&
        (bbT.preExisting as number) >= 1 &&
        bb.human.includes('VERIFIED ❌'),
      JSON.stringify({ ok: bb.body.ok, j: bbJ, t: bbT }),
    );

    // ── (bc) baseline cache path: clean-tree call CAPTURES the BASE signature
    //        set; a later changed call REUSES it (classification stable);
    //        corrupt/missing baseline → git-diff fallback, never throws ──────
    git('checkout', '--', 'src/calc.js');
    const bc1 = await call('atomic_verify', { scope: 'all', tscProject: abs('tsconfig.az.json'), cwd: tmpRel });
    let baseJson: Record<string, unknown> | null = null;
    try {
      baseJson = JSON.parse(fs.readFileSync(baselineFile, 'utf8')) as Record<string, unknown>;
    } catch {
      baseJson = null;
    }
    const baseProjects = (baseJson?.projects ?? {}) as Record<string, { signatures?: string[] }>;
    const azKey = Object.keys(baseProjects).find((k) => k.endsWith('tsconfig.az.json'));
    const azSigs = azKey ? baseProjects[azKey].signatures ?? [] : [];
    check(
      '(bc) clean-tree verify CAPTURES .atomic/tsc-baseline.json for the project (≥1 pre-existing signature)',
      typeof bc1.body.ok === 'boolean' &&
        baseJson !== null &&
        typeof azKey === 'string' &&
        azSigs.length >= 1 &&
        azSigs.some((s) => s.includes('preexist')),
      JSON.stringify({ azKey, n: azSigs.length }),
    );
    fs.writeFileSync(abs('inj.ts'), 'export const injVal: number = "boom2 not a number";\n');
    const bc2 = await call('atomic_verify', { scope: 'changed', tscProject: abs('tsconfig.az.json'), cwd: tmpRel });
    const bc2T = bc2.body.tsc as Record<string, unknown>;
    check(
      '(bc) 2nd call REUSES baseline: stable classification — introduced===1 (inj only), pre-existing NOT misattributed',
      bc2.body.ok === false &&
        bc2T.status === 'ran' &&
        bc2T.introduced === 1 &&
        (bc2T.preExisting as number) >= 1,
      JSON.stringify({ ok: bc2.body.ok, t: bc2T }),
    );
    fs.writeFileSync(baselineFile, 'not valid json {{{');
    fs.writeFileSync(abs('inj.ts'), 'export const injVal: number = "boom3 still bad";\n');
    const bc3 = await call('atomic_verify', { scope: 'changed', tscProject: abs('tsconfig.az.json'), cwd: tmpRel });
    const bc3T = bc3.body.tsc as Record<string, unknown>;
    check(
      '(bc) corrupt/missing baseline → git-diff fallback, NEVER throws (introduced≥1 still surfaced, verdict intact)',
      typeof bc3.body.ok === 'boolean' &&
        bc3.human.includes('VERIFIED') &&
        bc3T.status === 'ran' &&
        (bc3T.introduced as number) >= 1 &&
        bc3.body.ok === false,
      JSON.stringify({ ok: bc3.body.ok, t: bc3T }),
    );

    // ── (bc) coverage/targets derivation unchanged + decompose still green ──
    git('checkout', '--', 'inj.ts');
    fs.writeFileSync(abs('src/calc.js'), 'function add(a,b){return a+b+0;}\nmodule.exports={add};\n');
    const bc4 = await call('atomic_verify', { scope: 'changed', tscProject: abs('tsconfig.az.json'), cwd: tmpRel });
    const bc4Targets = (bc4.body.targets as string[]) || [];
    check(
      '(bc) targets derivation unchanged: scope:changed still derives calc.spec.js; clean change → ok:true',
      bc4.body.ok === true &&
        bc4Targets.some((t) => t.endsWith('calc.spec.js')) &&
        typeof bc4.body.tracePath === 'string',
      JSON.stringify({ ok: bc4.body.ok, targets: bc4Targets }),
    );
    fs.writeFileSync(
      abs('dq.ts'),
      ['export function aa(): number { return 1; }', 'export function bb(): number { return 2; }', 'export const cc = aa() + bb();', ''].join('\n'),
    );
    const dq = await call('atomic_decompose_file', {
      file: path.join(tmpRel, 'dq.ts'),
      plan: [{ symbols: ['aa', 'bb'], newModule: path.join(tmpRel, 'dq.part.ts') }],
    });
    check(
      '(bc) regression: decompose still green + OS-VALIDATED line references atomic_verify',
      dq.body.ok === true &&
        dq.body.changed === true &&
        dq.human.includes('OS-VALIDATED') &&
        dq.human.includes('mcp__atomic-edit__atomic_verify'),
      JSON.stringify({ ok: dq.body.ok, changed: dq.body.changed }),
    );
  } finally {
    try {
      await client.close();
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpAbs, { recursive: true, force: true });
  }
}

(async () => {
  await partA();
  await partB();
  await partC();
  await partD();
  partE();
  partF();
  partG();
  partI();
  partJ();
  await partK();
  await partH();
  await partTD26();
  partTD27();
  await partTD28();
  await partTD29();
  await partTD30();
  await partTD31();
  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  process.stderr.write(`SMOKE CRASH: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(2);
});
