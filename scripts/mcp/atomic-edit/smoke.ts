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
  renamePropertyKey,
  addAwaitToCall,
} from './advanced.js';
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
      'server lists all 37 tools (incl. atomic_create_file + atomic_delete_file + code_file_stat + analyzer transaction + product apex layer + rename property key + add await to call + insert after anchor + insert before anchor + replace between anchors + replace text in anchor region + atomic_edit unified router + code_outline_batch)',
      names.length === 37 &&
        names.includes('atomic_create_file') &&
        names.includes('atomic_delete_file') &&
        names.includes('code_file_stat') &&
        names.includes('atomic_replace_text') &&
        names.includes('atomic_transaction') &&
        names.includes('atomic_apply_eslint_dry_run_fixes') &&
        names.includes('atomic_wrap_range') &&
        names.includes('code_outline') &&
        names.includes('atomic_edit_symbol') &&
        names.includes('atomic_add_import') &&
        names.includes('atomic_remove_import') &&
        names.includes('atomic_replace_property_value') &&
        names.includes('atomic_rename_property_key') &&
        names.includes('atomic_add_await_to_call') &&
        names.includes('atomic_insert_after_anchor') &&
        names.includes('atomic_insert_before_anchor') &&
        names.includes('atomic_replace_between_anchors') &&
        names.includes('atomic_replace_text_in_anchor_region') &&
        names.includes('product_intent_contract') &&
        names.includes('zero_code_trust_score') &&
        names.includes('behavior_receipt') &&
        names.includes('truth_receipt') &&
        names.includes('continuity_status') &&
        names.includes('atomic_lock_acquire') &&
        names.includes('atomic_lock_status') &&
        names.includes('atomic_lock_release') &&
        names.includes('atomic_edit') &&
        names.includes('code_outline_batch'),
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
    const sha = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
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

    const rpkRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-rpk.${process.pid}.ts`);
    const rpkAbs = path.join(repoRoot, rpkRel);
    fs.writeFileSync(
      rpkAbs,
      "export const config = {\n  phone: '5511999999999',\n  timeout: 5000,\n};\n",
    );
    try {
      const rpkRes = (await client.callTool({
        name: 'atomic_rename_property_key',
        arguments: { file: rpkRel, property: 'phone', newKey: 'whatsappPhoneId' },
      })) as { content: { text: string }[]; isError?: boolean };
      const rpkBody = JSON.parse(rpkRes.content.at(-1)?.text ?? '{}');
      check(
        'live rename_property_key ok + changed',
        rpkRes.isError !== true && rpkBody.ok === true && rpkBody.changed === true,
        rpkRes.content[0]?.text ?? '',
      );
      const rpkAfter = fs.readFileSync(rpkAbs, 'utf8');
      check(
        'live rename_property_key renames key and preserves value',
        rpkAfter.includes('whatsappPhoneId') &&
          rpkAfter.includes("'5511999999999'") &&
          !rpkAfter.includes('phone:'),
        rpkAfter,
      );
    } finally {
      if (fs.existsSync(rpkAbs)) fs.unlinkSync(rpkAbs);
    }

    const rpkAmbiguousRel = path.join(
      'scripts',
      'mcp',
      'atomic-edit',
      `.smoke-rpk-ambiguous.${process.pid}.ts`,
    );
    const rpkAmbiguousAbs = path.join(repoRoot, rpkAmbiguousRel);
    fs.writeFileSync(rpkAmbiguousAbs, 'const a = { k: 1 };\nconst b = { k: 2 };\n');
    try {
      const rpkAmbiguous = (await client.callTool({
        name: 'atomic_rename_property_key',
        arguments: { file: rpkAmbiguousRel, property: 'k', newKey: 'key' },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'live rename_property_key refuses ambiguity',
        rpkAmbiguous.isError === true &&
          /matched 2 assignments/.test(rpkAmbiguous.content[0]?.text ?? ''),
        rpkAmbiguous.content[0]?.text ?? '',
      );
    } finally {
      if (fs.existsSync(rpkAmbiguousAbs)) fs.unlinkSync(rpkAmbiguousAbs);
    }

    // live add_await_to_call: wraps call in async function preserving call text
    const awaitRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-await.${process.pid}.ts`);
    const awaitAbs = path.join(repoRoot, awaitRel);
    fs.writeFileSync(
      awaitAbs,
      ['async function build() {', '  const ok = compute(1, 2);', '  return ok;', '}', ''].join(
        '\n',
      ),
    );
    try {
      const awaitRes = (await client.callTool({
        name: 'atomic_add_await_to_call',
        arguments: { file: awaitRel, callee: 'compute', selector: 'build' },
      })) as { content: { text: string }[]; isError?: boolean };
      const awaitBody = JSON.parse(awaitRes.content.at(-1)?.text ?? '{}');
      check(
        'live add_await_to_call wraps call with await',
        awaitRes.isError !== true && awaitBody.ok === true && awaitBody.changed === true,
        awaitRes.content[0]?.text ?? '',
      );
      const awaitAfter = fs.readFileSync(awaitAbs, 'utf8');
      check(
        'live add_await_to_call preserves call text',
        awaitAfter.includes('await compute(1, 2)') && awaitAfter.includes('async function build'),
        awaitAfter,
      );
    } finally {
      if (fs.existsSync(awaitAbs)) fs.unlinkSync(awaitAbs);
    }

    // ── atomic_insert_after_anchor ──
    const anchorRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-anchor.${process.pid}.ts`);
    const anchorAbs = path.join(repoRoot, anchorRel);
    fs.writeFileSync(anchorAbs, "export const ORDER = ['alpha'];\n");
    const anchorBefore = fs.readFileSync(anchorAbs, 'utf8');
    try {
      const anchorRes = (await client.callTool({
        name: 'atomic_insert_after_anchor',
        arguments: {
          file: anchorRel,
          anchorText: "'alpha'",
          insertText: ", 'beta'",
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const anchorBody = JSON.parse(anchorRes.content.at(-1)?.text ?? '{}');
      check(
        'insert_after_anchor inserts beta after alpha',
        anchorRes.isError !== true && anchorBody.ok === true && anchorBody.changed === true,
        anchorRes.content[0]?.text ?? '',
      );
      const anchorAfter = fs.readFileSync(anchorAbs, 'utf8');
      check(
        'insert_after_anchor preserves anchor and inserts only requested text',
        anchorAfter === "export const ORDER = ['alpha', 'beta'];\n" &&
          anchorAfter.indexOf("'alpha'") === anchorBefore.indexOf("'alpha'"),
        JSON.stringify(anchorAfter),
      );

      const previewBefore = fs.readFileSync(anchorAbs, 'utf8');
      const anchorPreview = (await client.callTool({
        name: 'atomic_insert_after_anchor',
        arguments: {
          file: anchorRel,
          anchorText: "'beta'",
          insertText: ", 'preview'",
          preview: true,
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const anchorPreviewBody = JSON.parse(anchorPreview.content.at(-1)?.text ?? '{}');
      check(
        'insert_after_anchor preview does not write',
        anchorPreview.isError !== true &&
          anchorPreviewBody.preview === true &&
          anchorPreviewBody.changed === false &&
          fs.readFileSync(anchorAbs, 'utf8') === previewBefore,
        anchorPreview.content[0]?.text ?? '',
      );

      const anchorMissing = (await client.callTool({
        name: 'atomic_insert_after_anchor',
        arguments: { file: anchorRel, anchorText: 'NONEXISTENT_ANCHOR', insertText: 'x' },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'insert_after_anchor refuses missing anchor',
        anchorMissing.isError === true &&
          /anchor text not found/.test(anchorMissing.content[0]?.text ?? ''),
        anchorMissing.content[0]?.text ?? '',
      );

      const anchorEmpty = (await client.callTool({
        name: 'atomic_insert_after_anchor',
        arguments: { file: anchorRel, anchorText: '', insertText: 'x' },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'insert_after_anchor refuses empty anchor',
        anchorEmpty.isError === true,
        anchorEmpty.content[0]?.text ?? '',
      );

      const ambigRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-anchor-ambig.${process.pid}.ts`,
      );
      const ambigAbs = path.join(repoRoot, ambigRel);
      fs.writeFileSync(ambigAbs, "export const PAIR = ['anchor', 'anchor'];\n");
      try {
        const anchorAmbig = (await client.callTool({
          name: 'atomic_insert_after_anchor',
          arguments: { file: ambigRel, anchorText: "'anchor'", insertText: ", 'dup'" },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'insert_after_anchor refuses ambiguity without occurrence',
          anchorAmbig.isError === true &&
            /appears 2 times/.test(anchorAmbig.content[0]?.text ?? ''),
          anchorAmbig.content[0]?.text ?? '',
        );

        const anchorOccurrence = (await client.callTool({
          name: 'atomic_insert_after_anchor',
          arguments: {
            file: ambigRel,
            anchorText: "'anchor'",
            insertText: ", 'second'",
            occurrence: 2,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        const anchorOccurrenceBody = JSON.parse(anchorOccurrence.content.at(-1)?.text ?? '{}');
        check(
          'insert_after_anchor occurrence targets requested match',
          anchorOccurrence.isError !== true &&
            anchorOccurrenceBody.ok === true &&
            anchorOccurrenceBody.changed === true,
          anchorOccurrence.content[0]?.text ?? '',
        );
        const ambigAfter = fs.readFileSync(ambigAbs, 'utf8');
        check(
          'insert_after_anchor occurrence preserves first match',
          ambigAfter === "export const PAIR = ['anchor', 'anchor', 'second'];\n",
          JSON.stringify(ambigAfter),
        );

        const anchorOutOfRange = (await client.callTool({
          name: 'atomic_insert_after_anchor',
          arguments: {
            file: ambigRel,
            anchorText: "'anchor'",
            insertText: 'x',
            occurrence: 99,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'insert_after_anchor refuses out-of-range occurrence',
          anchorOutOfRange.isError === true &&
            /out of range/.test(anchorOutOfRange.content[0]?.text ?? ''),
          anchorOutOfRange.content[0]?.text ?? '',
        );
      } finally {
        if (fs.existsSync(ambigAbs)) fs.unlinkSync(ambigAbs);
      }

      const anchorBadSha = (await client.callTool({
        name: 'atomic_insert_after_anchor',
        arguments: {
          file: anchorRel,
          anchorText: "'beta'",
          insertText: ", 'sha'",
          expectedSha256: 'deadbeef',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'insert_after_anchor sha guard refuses stale hash',
        anchorBadSha.isError === true &&
          /sha256 mismatch/.test(anchorBadSha.content[0]?.text ?? ''),
        anchorBadSha.content[0]?.text ?? '',
      );
    } finally {
      if (fs.existsSync(anchorAbs)) fs.unlinkSync(anchorAbs);
    }

    // ── atomic_insert_before_anchor ──
    const beforeAnchorRel = path.join(
      'scripts',
      'mcp',
      'atomic-edit',
      `.smoke-before-anchor.${process.pid}.ts`,
    );
    const beforeAnchorAbs = path.join(repoRoot, beforeAnchorRel);
    fs.writeFileSync(beforeAnchorAbs, "export const ORDER = ['alpha'];\n");
    const beforeAnchorBefore = fs.readFileSync(beforeAnchorAbs, 'utf8');
    try {
      const beforeAnchorRes = (await client.callTool({
        name: 'atomic_insert_before_anchor',
        arguments: {
          file: beforeAnchorRel,
          anchorText: "'alpha'",
          insertText: "'beta', ",
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const beforeAnchorBody = JSON.parse(beforeAnchorRes.content.at(-1)?.text ?? '{}');
      check(
        'insert_before_anchor inserts beta before alpha',
        beforeAnchorRes.isError !== true &&
          beforeAnchorBody.ok === true &&
          beforeAnchorBody.changed === true,
        beforeAnchorRes.content[0]?.text ?? '',
      );
      const beforeAnchorAfter = fs.readFileSync(beforeAnchorAbs, 'utf8');
      check(
        'insert_before_anchor preserves anchor and inserts only requested text',
        beforeAnchorAfter === "export const ORDER = ['beta', 'alpha'];\n" &&
          beforeAnchorAfter.indexOf("'alpha'") ===
            beforeAnchorBefore.indexOf("'alpha'") + "'beta', ".length,
        JSON.stringify(beforeAnchorAfter),
      );

      const beforeAnchorPreviewBefore = fs.readFileSync(beforeAnchorAbs, 'utf8');
      const beforeAnchorPreview = (await client.callTool({
        name: 'atomic_insert_before_anchor',
        arguments: {
          file: beforeAnchorRel,
          anchorText: "'beta'",
          insertText: "'preview', ",
          preview: true,
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const beforeAnchorPreviewBody = JSON.parse(beforeAnchorPreview.content.at(-1)?.text ?? '{}');
      check(
        'insert_before_anchor preview does not write',
        beforeAnchorPreview.isError !== true &&
          beforeAnchorPreviewBody.preview === true &&
          beforeAnchorPreviewBody.changed === false &&
          fs.readFileSync(beforeAnchorAbs, 'utf8') === beforeAnchorPreviewBefore,
        beforeAnchorPreview.content[0]?.text ?? '',
      );

      const beforeAnchorMissing = (await client.callTool({
        name: 'atomic_insert_before_anchor',
        arguments: {
          file: beforeAnchorRel,
          anchorText: 'NONEXISTENT_ANCHOR',
          insertText: 'x',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'insert_before_anchor refuses missing anchor',
        beforeAnchorMissing.isError === true &&
          /anchor text not found/.test(beforeAnchorMissing.content[0]?.text ?? ''),
        beforeAnchorMissing.content[0]?.text ?? '',
      );

      const beforeAnchorEmpty = (await client.callTool({
        name: 'atomic_insert_before_anchor',
        arguments: { file: beforeAnchorRel, anchorText: '', insertText: 'x' },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'insert_before_anchor refuses empty anchor',
        beforeAnchorEmpty.isError === true,
        beforeAnchorEmpty.content[0]?.text ?? '',
      );

      const beforeAmbigRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-before-anchor-ambig.${process.pid}.ts`,
      );
      const beforeAmbigAbs = path.join(repoRoot, beforeAmbigRel);
      fs.writeFileSync(beforeAmbigAbs, "export const PAIR = ['anchor', 'anchor'];\n");
      try {
        const beforeAnchorAmbig = (await client.callTool({
          name: 'atomic_insert_before_anchor',
          arguments: {
            file: beforeAmbigRel,
            anchorText: "'anchor'",
            insertText: "'dup', ",
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'insert_before_anchor refuses ambiguity without occurrence',
          beforeAnchorAmbig.isError === true &&
            /appears 2 times/.test(beforeAnchorAmbig.content[0]?.text ?? ''),
          beforeAnchorAmbig.content[0]?.text ?? '',
        );

        const beforeAnchorOccurrence = (await client.callTool({
          name: 'atomic_insert_before_anchor',
          arguments: {
            file: beforeAmbigRel,
            anchorText: "'anchor'",
            insertText: "'second', ",
            occurrence: 2,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        const beforeAnchorOccurrenceBody = JSON.parse(
          beforeAnchorOccurrence.content.at(-1)?.text ?? '{}',
        );
        check(
          'insert_before_anchor occurrence targets requested match',
          beforeAnchorOccurrence.isError !== true &&
            beforeAnchorOccurrenceBody.ok === true &&
            beforeAnchorOccurrenceBody.changed === true,
          beforeAnchorOccurrence.content[0]?.text ?? '',
        );
        const beforeAmbigAfter = fs.readFileSync(beforeAmbigAbs, 'utf8');
        check(
          'insert_before_anchor occurrence inserts before second match',
          beforeAmbigAfter === "export const PAIR = ['anchor', 'second', 'anchor'];\n",
          JSON.stringify(beforeAmbigAfter),
        );

        const beforeAnchorOutOfRange = (await client.callTool({
          name: 'atomic_insert_before_anchor',
          arguments: {
            file: beforeAmbigRel,
            anchorText: "'anchor'",
            insertText: 'x',
            occurrence: 99,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'insert_before_anchor refuses out-of-range occurrence',
          beforeAnchorOutOfRange.isError === true &&
            /out of range/.test(beforeAnchorOutOfRange.content[0]?.text ?? ''),
          beforeAnchorOutOfRange.content[0]?.text ?? '',
        );
      } finally {
        if (fs.existsSync(beforeAmbigAbs)) fs.unlinkSync(beforeAmbigAbs);
      }

      const beforeAnchorBadSha = (await client.callTool({
        name: 'atomic_insert_before_anchor',
        arguments: {
          file: beforeAnchorRel,
          anchorText: "'beta'",
          insertText: "'sha', ",
          expectedSha256: 'deadbeef',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'insert_before_anchor sha guard refuses stale hash',
        beforeAnchorBadSha.isError === true &&
          /sha256 mismatch/.test(beforeAnchorBadSha.content[0]?.text ?? ''),
        beforeAnchorBadSha.content[0]?.text ?? '',
      );
    } finally {
      if (fs.existsSync(beforeAnchorAbs)) fs.unlinkSync(beforeAnchorAbs);
    }

    // ── atomic_create_file ──
    // ── atomic_replace_between_anchors ──
    const replaceRel = path.join(
      'scripts',
      'mcp',
      'atomic-edit',
      `.smoke-replace-anchors.${process.pid}.ts`,
    );
    const replaceAbs = path.join(repoRoot, replaceRel);
    fs.writeFileSync(replaceAbs, 'export let DATA = `BEFORE alpha MIDDLE omega AFTER`;\n');
    try {
      const replaceRes = (await client.callTool({
        name: 'atomic_replace_between_anchors',
        arguments: {
          file: replaceRel,
          startAnchorText: 'alpha ',
          endAnchorText: ' omega',
          replacementText: 'REPLACED',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const replaceBody = JSON.parse(replaceRes.content.at(-1)?.text ?? '{}');
      check(
        'replace_between_anchors replaces text between anchors',
        replaceRes.isError !== true && replaceBody.ok === true && replaceBody.changed === true,
        replaceRes.content[0]?.text ?? '',
      );
      const replaceAfter = fs.readFileSync(replaceAbs, 'utf8');
      check(
        'replace_between_anchors preserves both anchors',
        replaceAfter === 'export let DATA = `BEFORE alpha REPLACED omega AFTER`;\n' &&
          replaceAfter.indexOf('alpha ') < replaceAfter.indexOf('REPLACED') &&
          replaceAfter.indexOf('REPLACED') < replaceAfter.indexOf(' omega'),
        JSON.stringify(replaceAfter),
      );

      const previewBefore = fs.readFileSync(replaceAbs, 'utf8');
      const replacePreview = (await client.callTool({
        name: 'atomic_replace_between_anchors',
        arguments: {
          file: replaceRel,
          startAnchorText: 'REPLACED',
          endAnchorText: 'AFTER',
          replacementText: 'PREVIEW',
          preview: true,
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const replacePreviewBody = JSON.parse(replacePreview.content.at(-1)?.text ?? '{}');
      check(
        'replace_between_anchors preview does not write',
        replacePreview.isError !== true &&
          replacePreviewBody.preview === true &&
          replacePreviewBody.changed === false &&
          fs.readFileSync(replaceAbs, 'utf8') === previewBefore,
        replacePreview.content[0]?.text ?? '',
      );

      const replaceMissingStart = (await client.callTool({
        name: 'atomic_replace_between_anchors',
        arguments: {
          file: replaceRel,
          startAnchorText: 'NONEXISTENT',
          endAnchorText: 'omega',
          replacementText: 'x',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_between_anchors refuses missing start anchor',
        replaceMissingStart.isError === true &&
          /start anchor text not found/.test(replaceMissingStart.content[0]?.text ?? ''),
        replaceMissingStart.content[0]?.text ?? '',
      );

      const replaceMissingEnd = (await client.callTool({
        name: 'atomic_replace_between_anchors',
        arguments: {
          file: replaceRel,
          startAnchorText: 'alpha',
          endAnchorText: 'NONEXISTENT',
          replacementText: 'x',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_between_anchors refuses missing end anchor after start',
        replaceMissingEnd.isError === true &&
          /end anchor text not found/.test(replaceMissingEnd.content[0]?.text ?? ''),
        replaceMissingEnd.content[0]?.text ?? '',
      );

      const replaceEmptyStart = (await client.callTool({
        name: 'atomic_replace_between_anchors',
        arguments: {
          file: replaceRel,
          startAnchorText: '',
          endAnchorText: 'omega',
          replacementText: 'x',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_between_anchors refuses empty start anchor',
        replaceEmptyStart.isError === true,
        replaceEmptyStart.content[0]?.text ?? '',
      );

      const replaceEmptyEnd = (await client.callTool({
        name: 'atomic_replace_between_anchors',
        arguments: {
          file: replaceRel,
          startAnchorText: 'alpha',
          endAnchorText: '',
          replacementText: 'x',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_between_anchors refuses empty end anchor',
        replaceEmptyEnd.isError === true,
        replaceEmptyEnd.content[0]?.text ?? '',
      );

      const ambigRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-replace-anchors-ambig.${process.pid}.ts`,
      );
      const ambigAbs = path.join(repoRoot, ambigRel);
      fs.writeFileSync(
        ambigAbs,
        'export let X = `BEFORE alpha BODY omega alpha BODY2 omega AFTER`;\n',
      );
      try {
        const replaceAmbig = (await client.callTool({
          name: 'atomic_replace_between_anchors',
          arguments: {
            file: ambigRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            replacementText: 'REPLACED',
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'replace_between_anchors refuses ambiguous start without occurrence',
          replaceAmbig.isError === true &&
            /appears 2 times/.test(replaceAmbig.content[0]?.text ?? ''),
          replaceAmbig.content[0]?.text ?? '',
        );

        const replaceOccurrence = (await client.callTool({
          name: 'atomic_replace_between_anchors',
          arguments: {
            file: ambigRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            replacementText: 'SECOND',
            occurrence: 2,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        const replaceOccurrenceBody = JSON.parse(replaceOccurrence.content.at(-1)?.text ?? '{}');
        check(
          'replace_between_anchors occurrence targets requested match',
          replaceOccurrence.isError !== true &&
            replaceOccurrenceBody.ok === true &&
            replaceOccurrenceBody.changed === true,
          replaceOccurrence.content[0]?.text ?? '',
        );
        const ambigAfter = fs.readFileSync(ambigAbs, 'utf8');
        check(
          'replace_between_anchors occurrence replaces only between second pair',
          ambigAfter === 'export let X = `BEFORE alpha BODY omega alpha SECOND omega AFTER`;\n',
          JSON.stringify(ambigAfter),
        );

        const replaceOutOfRange = (await client.callTool({
          name: 'atomic_replace_between_anchors',
          arguments: {
            file: ambigRel,
            startAnchorText: 'alpha',
            endAnchorText: 'omega',
            replacementText: 'x',
            occurrence: 99,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'replace_between_anchors refuses out-of-range occurrence',
          replaceOutOfRange.isError === true &&
            /out of range/.test(replaceOutOfRange.content[0]?.text ?? ''),
          replaceOutOfRange.content[0]?.text ?? '',
        );
      } finally {
        if (fs.existsSync(ambigAbs)) fs.unlinkSync(ambigAbs);
      }

      const replaceBadSha = (await client.callTool({
        name: 'atomic_replace_between_anchors',
        arguments: {
          file: replaceRel,
          startAnchorText: 'REPLACED',
          endAnchorText: 'AFTER',
          replacementText: 'SHA',
          expectedSha256: 'deadbeef',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_between_anchors sha guard refuses stale hash',
        replaceBadSha.isError === true &&
          /sha256 mismatch/.test(replaceBadSha.content[0]?.text ?? ''),
        replaceBadSha.content[0]?.text ?? '',
      );
    } finally {
      if (fs.existsSync(replaceAbs)) fs.unlinkSync(replaceAbs);
    }

    // ── atomic_replace_text_in_anchor_region ──
    const rtaRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-rta.${process.pid}.ts`);
    const rtaAbs = path.join(repoRoot, rtaRel);
    fs.writeFileSync(rtaAbs, 'export let A = `BEFORE alpha MIDDLE omega AFTER`;\n');
    try {
      const rtaRes = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: 'alpha ',
          endAnchorText: ' omega',
          oldText: 'MIDDLE',
          newText: 'REPLACED',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const rtaBody = JSON.parse(rtaRes.content.at(-1)?.text ?? '{}');
      check(
        'replace_text_in_anchor_region replaces text inside region',
        rtaRes.isError !== true && rtaBody.ok === true && rtaBody.changed === true,
        rtaRes.content[0]?.text ?? '',
      );
      const rtaAfter = fs.readFileSync(rtaAbs, 'utf8');
      check(
        'replace_text_in_anchor_region preserves anchors',
        rtaAfter === 'export let A = `BEFORE alpha REPLACED omega AFTER`;\n' &&
          rtaAfter.indexOf('alpha ') < rtaAfter.indexOf('REPLACED') &&
          rtaAfter.indexOf('REPLACED') < rtaAfter.indexOf(' omega'),
        JSON.stringify(rtaAfter),
      );

      const rtaPreviewBefore = fs.readFileSync(rtaAbs, 'utf8');
      const rtaPreview = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: 'alpha ',
          endAnchorText: ' omega',
          oldText: 'REPLACED',
          newText: 'PREVIEW',
          preview: true,
        },
      })) as { content: { text: string }[]; isError?: boolean };
      const rtaPreviewBody = JSON.parse(rtaPreview.content.at(-1)?.text ?? '{}');
      check(
        'replace_text_in_anchor_region preview does not write',
        rtaPreview.isError !== true &&
          rtaPreviewBody.preview === true &&
          rtaPreviewBody.changed === false &&
          fs.readFileSync(rtaAbs, 'utf8') === rtaPreviewBefore,
        rtaPreview.content[0]?.text ?? '',
      );

      const rtaMissingStart = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: 'NONEXISTENT',
          endAnchorText: ' omega',
          oldText: 'x',
          newText: 'y',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_text_in_anchor_region refuses missing startAnchorText',
        rtaMissingStart.isError === true &&
          /startAnchorText not found/.test(rtaMissingStart.content[0]?.text ?? ''),
        rtaMissingStart.content[0]?.text ?? '',
      );

      const rtaMissingEnd = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: 'alpha ',
          endAnchorText: 'NONEXISTENT',
          oldText: 'x',
          newText: 'y',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_text_in_anchor_region refuses missing endAnchorText after start',
        rtaMissingEnd.isError === true &&
          /endAnchorText not found/.test(rtaMissingEnd.content[0]?.text ?? ''),
        rtaMissingEnd.content[0]?.text ?? '',
      );

      const rtaEmptyStart = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: '',
          endAnchorText: ' omega',
          oldText: 'x',
          newText: 'y',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_text_in_anchor_region refuses empty startAnchorText',
        rtaEmptyStart.isError === true,
        rtaEmptyStart.content[0]?.text ?? '',
      );

      const rtaEmptyEnd = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: 'alpha ',
          endAnchorText: '',
          oldText: 'x',
          newText: 'y',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_text_in_anchor_region refuses empty endAnchorText',
        rtaEmptyEnd.isError === true,
        rtaEmptyEnd.content[0]?.text ?? '',
      );

      const rtaEmptyOld = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: 'alpha ',
          endAnchorText: ' omega',
          oldText: '',
          newText: 'y',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_text_in_anchor_region refuses empty oldText',
        rtaEmptyOld.isError === true,
        rtaEmptyOld.content[0]?.text ?? '',
      );

      // ── outside identical oldText preserved ──
      const rtaOutsideRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-rta-outside.${process.pid}.ts`,
      );
      const rtaOutsideAbs = path.join(repoRoot, rtaOutsideRel);
      fs.writeFileSync(rtaOutsideAbs, 'export let X = `OUTSIDE alpha OUTSIDE omega OUTSIDE`;\n');
      try {
        const rtaOutside = (await client.callTool({
          name: 'atomic_replace_text_in_anchor_region',
          arguments: {
            file: rtaOutsideRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            oldText: 'OUTSIDE',
            newText: 'INNER',
          },
        })) as { content: { text: string }[]; isError?: boolean };
        const rtaOutsideBody = JSON.parse(rtaOutside.content.at(-1)?.text ?? '{}');
        check(
          'replace_text_in_anchor_region preserves outside identical oldText',
          rtaOutside.isError !== true &&
            rtaOutsideBody.ok === true &&
            rtaOutsideBody.changed === true,
          rtaOutside.content[0]?.text ?? '',
        );
        const rtaOutsideAfter = fs.readFileSync(rtaOutsideAbs, 'utf8');
        check(
          'replace_text_in_anchor_region only replaces inside the region',
          rtaOutsideAfter === 'export let X = `OUTSIDE alpha INNER omega OUTSIDE`;\n' &&
            rtaOutsideAfter.indexOf('alpha ') < rtaOutsideAfter.indexOf('INNER') &&
            rtaOutsideAfter.indexOf('INNER') < rtaOutsideAfter.indexOf(' omega'),
          JSON.stringify(rtaOutsideAfter),
        );
      } finally {
        if (fs.existsSync(rtaOutsideAbs)) fs.unlinkSync(rtaOutsideAbs);
      }

      // ── ambiguous region + regionOccurrence + out-of-range regionOccurrence ──
      const rtaAmbigRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-rta-ambig.${process.pid}.ts`,
      );
      const rtaAmbigAbs = path.join(repoRoot, rtaAmbigRel);
      fs.writeFileSync(rtaAmbigAbs, 'const X = `R1 alpha A1 omega R1 alpha A2 omega R2`;\n');
      try {
        const rtaAmbig = (await client.callTool({
          name: 'atomic_replace_text_in_anchor_region',
          arguments: {
            file: rtaAmbigRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            oldText: 'A1',
            newText: 'FIRST',
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'replace_text_in_anchor_region refuses ambiguous region without regionOccurrence',
          rtaAmbig.isError === true && /appears 2 times/.test(rtaAmbig.content[0]?.text ?? ''),
          rtaAmbig.content[0]?.text ?? '',
        );

        const rtaRegionOc = (await client.callTool({
          name: 'atomic_replace_text_in_anchor_region',
          arguments: {
            file: rtaAmbigRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            oldText: 'A2',
            newText: 'SECOND',
            regionOccurrence: 2,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        const rtaRegionOcBody = JSON.parse(rtaRegionOc.content.at(-1)?.text ?? '{}');
        check(
          'replace_text_in_anchor_region regionOccurrence targets correct region',
          rtaRegionOc.isError !== true &&
            rtaRegionOcBody.ok === true &&
            rtaRegionOcBody.changed === true,
          rtaRegionOc.content[0]?.text ?? '',
        );
        const rtaRegionOcAfter = fs.readFileSync(rtaAmbigAbs, 'utf8');
        check(
          'replace_text_in_anchor_region regionOccurrence replaces only in selected region',
          rtaRegionOcAfter === 'const X = `R1 alpha A1 omega R1 alpha SECOND omega R2`;\n',
          JSON.stringify(rtaRegionOcAfter),
        );

        // repair for next tests: write back original content
        fs.writeFileSync(rtaAmbigAbs, 'const X = `R1 alpha A1 omega R1 alpha A2 omega R2`;\n');

        const rtaRegionOoR = (await client.callTool({
          name: 'atomic_replace_text_in_anchor_region',
          arguments: {
            file: rtaAmbigRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            oldText: 'A2',
            newText: 'X',
            regionOccurrence: 99,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'replace_text_in_anchor_region refuses out-of-range regionOccurrence',
          rtaRegionOoR.isError === true && /out of range/.test(rtaRegionOoR.content[0]?.text ?? ''),
          rtaRegionOoR.content[0]?.text ?? '',
        );
      } finally {
        if (fs.existsSync(rtaAmbigAbs)) fs.unlinkSync(rtaAmbigAbs);
      }

      // ── textOccurrence + out-of-range textOccurrence ──
      const rtaTextOcRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-rta-textoc.${process.pid}.ts`,
      );
      const rtaTextOcAbs = path.join(repoRoot, rtaTextOcRel);
      fs.writeFileSync(rtaTextOcAbs, 'export let Z = `BEFORE alpha DUP DUP DUP omega AFTER`;\n');
      try {
        const rtaTextAmbig = (await client.callTool({
          name: 'atomic_replace_text_in_anchor_region',
          arguments: {
            file: rtaTextOcRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            oldText: 'DUP',
            newText: 'REP',
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'replace_text_in_anchor_region refuses ambiguous oldText without textOccurrence',
          rtaTextAmbig.isError === true &&
            /appears 3 times/.test(rtaTextAmbig.content[0]?.text ?? ''),
          rtaTextAmbig.content[0]?.text ?? '',
        );

        const rtaTextOc = (await client.callTool({
          name: 'atomic_replace_text_in_anchor_region',
          arguments: {
            file: rtaTextOcRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            oldText: 'DUP',
            newText: 'SELECTED',
            textOccurrence: 2,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        const rtaTextOcBody = JSON.parse(rtaTextOc.content.at(-1)?.text ?? '{}');
        check(
          'replace_text_in_anchor_region textOccurrence selects correct match',
          rtaTextOc.isError !== true && rtaTextOcBody.ok === true && rtaTextOcBody.changed === true,
          rtaTextOc.content[0]?.text ?? '',
        );
        const rtaTextOcAfter = fs.readFileSync(rtaTextOcAbs, 'utf8');
        check(
          'replace_text_in_anchor_region textOccurrence replaces only selected match',
          rtaTextOcAfter === 'export let Z = `BEFORE alpha DUP SELECTED DUP omega AFTER`;\n',
          JSON.stringify(rtaTextOcAfter),
        );

        const rtaTextOoR = (await client.callTool({
          name: 'atomic_replace_text_in_anchor_region',
          arguments: {
            file: rtaTextOcRel,
            startAnchorText: 'alpha ',
            endAnchorText: ' omega',
            oldText: 'DUP',
            newText: 'X',
            textOccurrence: 99,
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'replace_text_in_anchor_region refuses out-of-range textOccurrence',
          rtaTextOoR.isError === true && /out of range/.test(rtaTextOoR.content[0]?.text ?? ''),
          rtaTextOoR.content[0]?.text ?? '',
        );
      } finally {
        if (fs.existsSync(rtaTextOcAbs)) fs.unlinkSync(rtaTextOcAbs);
      }

      const rtaBadSha = (await client.callTool({
        name: 'atomic_replace_text_in_anchor_region',
        arguments: {
          file: rtaRel,
          startAnchorText: 'alpha ',
          endAnchorText: ' omega',
          oldText: 'REPLACED',
          newText: 'SHA',
          expectedSha256: 'deadbeef',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'replace_text_in_anchor_region sha guard refuses stale hash',
        rtaBadSha.isError === true && /sha256 mismatch/.test(rtaBadSha.content[0]?.text ?? ''),
        rtaBadSha.content[0]?.text ?? '',
      );
    } finally {
      if (fs.existsSync(rtaAbs)) fs.unlinkSync(rtaAbs);
    }

    const createBaseRel = path.join(
      'scripts',
      'mcp',
      'atomic-edit',
      `.smoke-create-base.${process.pid}`,
    );
    const createRel = path.join(createBaseRel, 'nested', `file.${process.pid}.ts`);
    const createAbs = path.join(repoRoot, createRel);

    try {
      // Preview of missing file — must NOT create file or parent directory
      const createPrev = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: createRel,
          content: 'export const CREATED = 1;\n',
          preview: true,
        },
      })) as { content: { text: string }[] };
      const createPrevBody = JSON.parse(createPrev.content.at(-1)?.text ?? '{}');
      check(
        'create_file preview does not create file',
        createPrevBody.ok === true &&
          createPrevBody.preview === true &&
          createPrevBody.changed === false &&
          !fs.existsSync(createAbs),
        createPrev.content[0]?.text ?? '',
      );
      check(
        'create_file preview does not create parent directory',
        !fs.existsSync(path.join(repoRoot, createBaseRel)),
        createBaseRel,
      );
      const createPrevTracePath =
        typeof createPrevBody.tracePath === 'string'
          ? path.join(repoRoot, createPrevBody.tracePath)
          : '';
      const createPrevTrace =
        createPrevTracePath && fs.existsSync(createPrevTracePath)
          ? JSON.parse(fs.readFileSync(createPrevTracePath, 'utf8'))
          : {};
      check(
        'create_file preview trace is honest',
        createPrevTrace.operation === 'atomic_create_file' &&
          createPrevTrace.preview === true &&
          createPrevTrace.changed === false,
        JSON.stringify(createPrevTrace),
      );

      // Commit — creates parent directories, writes file
      const createCommit = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: createRel,
          content: 'export const CREATED = 1;\n',
        },
      })) as { content: { text: string }[] };
      const createCommitBody = JSON.parse(createCommit.content.at(-1)?.text ?? '{}');
      check(
        'create_file commit creates file',
        createCommitBody.ok === true &&
          createCommitBody.changed === true &&
          createCommitBody.created === true &&
          String(createCommit.content[0]?.text ?? '').includes('Created') &&
          fs.existsSync(createAbs),
        createCommit.content[0]?.text ?? '',
      );
      check(
        'create_file commit created parent directories',
        fs.existsSync(path.join(repoRoot, createBaseRel)),
        createBaseRel,
      );
      check(
        'create_file commit wrote correct content',
        fs.readFileSync(createAbs, 'utf8') === 'export const CREATED = 1;\n',
        fs.readFileSync(createAbs, 'utf8'),
      );

      // Existing non-empty file refused
      const createNonEmpty = (await client.callTool({
        name: 'atomic_create_file',
        arguments: {
          file: createRel,
          content: 'export const REPLACE = 2;\n',
        },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'create_file refuses existing non-empty file',
        createNonEmpty.isError === true &&
          /already exists.*non-empty/i.test(createNonEmpty.content[0]?.text ?? ''),
        createNonEmpty.content[0]?.text ?? '',
      );
      check(
        'create_file non-empty refusal preserved original content',
        fs.readFileSync(createAbs, 'utf8') === 'export const CREATED = 1;\n',
        fs.readFileSync(createAbs, 'utf8'),
      );

      // Existing empty file — fill with content
      const emptyRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-create-empty.${process.pid}.ts`,
      );
      const emptyAbs = path.join(repoRoot, emptyRel);
      fs.writeFileSync(emptyAbs, '');
      try {
        const fillEmpty = (await client.callTool({
          name: 'atomic_create_file',
          arguments: {
            file: emptyRel,
            content: 'export const FILLED = 42;\n',
          },
        })) as { content: { text: string }[] };
        const fillEmptyBody = JSON.parse(fillEmpty.content.at(-1)?.text ?? '{}');
        check(
          'create_file fills existing empty file',
          fillEmptyBody.ok === true &&
            fillEmptyBody.changed === true &&
            fillEmptyBody.created === false,
          fillEmpty.content[0]?.text ?? '',
        );
        check(
          'create_file empty fill wrote content',
          fs.readFileSync(emptyAbs, 'utf8') === 'export const FILLED = 42;\n',
          fs.readFileSync(emptyAbs, 'utf8'),
        );

        // Stale sha refusal on existing empty file
        fs.writeFileSync(emptyAbs, '');
        const shaHelper = (v: string | Buffer) =>
          crypto.createHash('sha256').update(v).digest('hex');
        const staleShaEmpty = (await client.callTool({
          name: 'atomic_create_file',
          arguments: {
            file: emptyRel,
            content: 'export const Y = 1;\n',
            expectedSha256: 'deadbeef',
          },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'create_file refuses stale sha on existing empty file',
          staleShaEmpty.isError === true &&
            /sha256 mismatch/.test(staleShaEmpty.content[0]?.text ?? ''),
          staleShaEmpty.content[0]?.text ?? '',
        );

        // Correct sha on empty file allows fill
        const correctShaEmpty = (await client.callTool({
          name: 'atomic_create_file',
          arguments: {
            file: emptyRel,
            content: 'export const OK = 99;\n',
            expectedSha256: shaHelper(''),
          },
        })) as { content: { text: string }[] };
        const correctShaBody = JSON.parse(correctShaEmpty.content.at(-1)?.text ?? '{}');
        check(
          'create_file correct sha on empty file succeeds',
          correctShaBody.ok === true && correctShaBody.changed === true,
          correctShaEmpty.content[0]?.text ?? '',
        );
        check(
          'create_file correct sha wrote expected content',
          fs.readFileSync(emptyAbs, 'utf8') === 'export const OK = 99;\n',
          fs.readFileSync(emptyAbs, 'utf8'),
        );
      } finally {
        if (fs.existsSync(emptyAbs)) fs.unlinkSync(emptyAbs);
      }

      // Protected path refusal
      const createProtected = (await client.callTool({
        name: 'atomic_create_file',
        arguments: { file: 'CLAUDE.md', content: 'x\n' },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'create_file refuses governance-protected path',
        createProtected.isError === true &&
          /governance-protected/.test(createProtected.content[0]?.text ?? ''),
        createProtected.content[0]?.text ?? '',
      );

      // Multi-line .mjs content create (AB10 source-file creation case)
      const mjsRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-create-mjs.${process.pid}.mjs`,
      );
      const mjsAbs = path.join(repoRoot, mjsRel);
      const mjsContent = [
        '#!/usr/bin/env node',
        "import { readFileSync } from 'node:fs';",
        "import { resolve } from 'node:path';",
        '',
        'function main(args) {',
        "  const file = resolve(args[0] ?? '.');",
        '  return readFileSync(file, "utf8");',
        '}',
        '',
        'console.log(main(process.argv.slice(2)));',
        '',
      ].join('\n');
      try {
        const mjsCreate = (await client.callTool({
          name: 'atomic_create_file',
          arguments: { file: mjsRel, content: mjsContent },
        })) as { content: { text: string }[] };
        const mjsBody = JSON.parse(mjsCreate.content.at(-1)?.text ?? '{}');
        check(
          'create_file multi-line .mjs source file',
          mjsBody.ok === true && mjsBody.changed === true && mjsBody.created === true,
          mjsCreate.content[0]?.text ?? '',
        );
        check(
          'create_file .mjs content written correctly',
          fs.existsSync(mjsAbs) && fs.readFileSync(mjsAbs, 'utf8') === mjsContent,
          fs.existsSync(mjsAbs) ? fs.readFileSync(mjsAbs, 'utf8') : 'missing',
        );
      } finally {
        if (fs.existsSync(mjsAbs)) fs.unlinkSync(mjsAbs);
      }
    } finally {
      if (fs.existsSync(createAbs)) fs.unlinkSync(createAbs);
      const nestedDir = path.dirname(createAbs);
      if (fs.existsSync(nestedDir)) fs.rmdirSync(nestedDir);
      const baseDir = path.join(repoRoot, createBaseRel);
      if (fs.existsSync(baseDir)) {
        const nestedAtBase = path.join(baseDir, 'nested');
        if (fs.existsSync(nestedAtBase)) fs.rmdirSync(nestedAtBase);
        fs.rmdirSync(baseDir);
      }
    }

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

    const fileStat = (await client.callTool({
      name: 'code_file_stat',
      arguments: { file: fixtureRel },
    })) as { content: { text: string }[] };
    const fileStatBody = JSON.parse(fileStat.content.at(-1)?.text ?? '{}');
    const fixtureBytes = fs.readFileSync(fixtureAbs);
    check(
      'code_file_stat fixture file returns ok+exists',
      fileStatBody.ok === true &&
        fileStatBody.changed === false &&
        fileStatBody.exists === true &&
        fileStatBody.kind === 'file' &&
        fileStatBody.bytes === fixtureBytes.byteLength &&
        typeof fileStatBody.sha256 === 'string' &&
        typeof fileStatBody.mtimeMs === 'number',
      fileStat.content[0]?.text ?? '',
    );
    check(
      'code_file_stat fixture file raw hash matches bytes',
      fileStatBody.sha256 === sha(fixtureBytes),
      `${fileStatBody.sha256} vs ${sha(fixtureBytes)}`,
    );
    check(
      'code_file_stat fixture file never returns content',
      !('content' in fileStatBody) &&
        !('text' in fileStatBody) &&
        !('data' in fileStatBody) &&
        !('fullText' in fileStatBody),
      JSON.stringify(Object.keys(fileStatBody)),
    );

    const missingStat = (await client.callTool({
      name: 'code_file_stat',
      arguments: { file: `scripts/mcp/atomic-edit/.smoke-nonexistent.${process.pid}.ts` },
    })) as { content: { text: string }[] };
    const missingStatBody = JSON.parse(missingStat.content.at(-1)?.text ?? '{}');
    check(
      'code_file_stat missing path is non-throwing (ok:true, kind:missing)',
      missingStatBody.ok === true &&
        missingStatBody.changed === false &&
        missingStatBody.exists === false &&
        missingStatBody.kind === 'missing',
      missingStat.content[0]?.text ?? '',
    );

    const dirStat = (await client.callTool({
      name: 'code_file_stat',
      arguments: { file: 'scripts/mcp/atomic-edit' },
    })) as { content: { text: string }[] };
    const dirStatBody = JSON.parse(dirStat.content.at(-1)?.text ?? '{}');
    check(
      'code_file_stat directory returns kind=directory, no sha256/bytes/content',
      dirStatBody.ok === true &&
        dirStatBody.changed === false &&
        dirStatBody.exists === true &&
        dirStatBody.kind === 'directory' &&
        !('sha256' in dirStatBody) &&
        !('bytes' in dirStatBody) &&
        !('content' in dirStatBody),
      dirStat.content[0]?.text ?? '',
    );

    const protectedStat = (await client.callTool({
      name: 'code_file_stat',
      arguments: { file: 'CLAUDE.md' },
    })) as { content: { text: string }[] };
    const protectedStatBody = JSON.parse(protectedStat.content.at(-1)?.text ?? '{}');
    check(
      'code_file_stat protected path marked protected=true, no content/bytes/sha256',
      protectedStatBody.ok === true &&
        protectedStatBody.protected === true &&
        !('sha256' in protectedStatBody) &&
        !('bytes' in protectedStatBody) &&
        !('content' in protectedStatBody),
      protectedStat.content[0]?.text ?? '',
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

    const literalPreviewBefore = fs.readFileSync(fixtureAbs, 'utf8');
    const literalPreview = (await client.callTool({
      name: 'atomic_replace_literal',
      arguments: {
        file: fixtureRel,
        currentText: "'5511999999999'",
        newText: 'null',
        expectedSha256: sha(literalPreviewBefore),
        preview: true,
      },
    })) as { content: { text: string }[] };
    const literalPreviewBody = JSON.parse(literalPreview.content.at(-1)?.text ?? '{}');
    check(
      'literal preview dry-run does not write',
      literalPreviewBody.preview === true &&
        literalPreviewBody.changed === false &&
        fs.readFileSync(fixtureAbs, 'utf8') === literalPreviewBefore,
      literalPreview.content[0].text,
    );
    const literalPreviewTracePath =
      typeof literalPreviewBody.tracePath === 'string'
        ? path.join(repoRoot, literalPreviewBody.tracePath)
        : '';
    const literalPreviewTrace =
      literalPreviewTracePath && fs.existsSync(literalPreviewTracePath)
        ? JSON.parse(fs.readFileSync(literalPreviewTracePath, 'utf8'))
        : {};
    const literalPreviewProposal = literalPreviewBefore.replace("'5511999999999'", 'null');
    check(
      'literal preview trace marks proposed but not written',
      literalPreviewTrace.preview === true &&
        literalPreviewTrace.changed === false &&
        literalPreviewTrace.afterSha256 === sha(literalPreviewBefore) &&
        literalPreviewTrace.proposedSha256 === sha(literalPreviewProposal),
      JSON.stringify(literalPreviewTrace),
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

    // ── atomic_delete_file ──
    const delRel = path.join('scripts', 'mcp', 'atomic-edit', `.smoke-delete.${process.pid}.ts`);
    const delAbs = path.join(repoRoot, delRel);
    fs.writeFileSync(delAbs, 'export const WILL_DELETE = 1;\n');
    const delBefore = fs.readFileSync(delAbs, 'utf8');
    const delSha = sha(delBefore);

    try {
      const delPrev = (await client.callTool({
        name: 'atomic_delete_file',
        arguments: { file: delRel, preview: true },
      })) as { content: { text: string }[] };
      const delPrevBody = JSON.parse(delPrev.content.at(-1)?.text ?? '{}');
      const delPrevTracePath =
        typeof delPrevBody.tracePath === 'string' ? path.join(repoRoot, delPrevBody.tracePath) : '';
      const delPrevTrace =
        delPrevTracePath && fs.existsSync(delPrevTracePath)
          ? JSON.parse(fs.readFileSync(delPrevTracePath, 'utf8'))
          : {};
      check(
        'delete_file preview does not delete',
        delPrevBody.preview === true &&
          delPrevBody.changed === false &&
          String(delPrevBody.note).includes('dry-run') &&
          fs.existsSync(delAbs),
        delPrev.content[0]?.text ?? '',
      );
      check(
        'delete_file preview trace is honest',
        delPrevTrace.operation === 'atomic_delete_file' &&
          delPrevTrace.preview === true &&
          delPrevTrace.changed === false &&
          delPrevTrace.afterSha256 === sha(delBefore) &&
          delPrevTrace.proposedSha256 === sha(''),
        JSON.stringify(delPrevTrace),
      );

      const delCommit = (await client.callTool({
        name: 'atomic_delete_file',
        arguments: { file: delRel, expectedSha256: delSha },
      })) as { content: { text: string }[] };
      const delCommitBody = JSON.parse(delCommit.content.at(-1)?.text ?? '{}');
      const delCommitTracePath =
        typeof delCommitBody.tracePath === 'string'
          ? path.join(repoRoot, delCommitBody.tracePath)
          : '';
      const delCommitTrace =
        delCommitTracePath && fs.existsSync(delCommitTracePath)
          ? JSON.parse(fs.readFileSync(delCommitTracePath, 'utf8'))
          : {};
      check(
        'delete_file commit deletes the file',
        delCommitBody.ok === true &&
          delCommitBody.changed === true &&
          delCommitBody.deleted === true &&
          delCommitBody.afterSha256 === sha('') &&
          !fs.existsSync(delAbs),
        delCommit.content[0]?.text ?? '',
      );
      check(
        'delete_file commit trace is honest',
        delCommitTrace.operation === 'atomic_delete_file' &&
          delCommitTrace.preview === false &&
          delCommitTrace.changed === true &&
          delCommitTrace.afterSha256 === sha('') &&
          delCommitTrace.semanticImpact === 'file_deleted',
        JSON.stringify(delCommitTrace),
      );

      const delMissing = (await client.callTool({
        name: 'atomic_delete_file',
        arguments: { file: delRel },
      })) as { content: { text: string }[] };
      const delMissingBody = JSON.parse(delMissing.content.at(-1)?.text ?? '{}');
      check(
        'delete_file idempotent on absent file',
        delMissingBody.ok === true &&
          delMissingBody.changed === false &&
          delMissingBody.exists === false,
        delMissing.content[0]?.text ?? '',
      );

      const delDir = (await client.callTool({
        name: 'atomic_delete_file',
        arguments: { file: 'scripts/mcp/atomic-edit' },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'delete_file refuses directory',
        delDir.isError === true && /directory/.test(delDir.content[0]?.text ?? ''),
        delDir.content[0]?.text ?? '',
      );

      const delProtected = (await client.callTool({
        name: 'atomic_delete_file',
        arguments: { file: 'CLAUDE.md' },
      })) as { content: { text: string }[]; isError?: boolean };
      check(
        'delete_file refuses governance-protected file',
        delProtected.isError === true &&
          /governance-protected/.test(delProtected.content[0]?.text ?? ''),
        delProtected.content[0]?.text ?? '',
      );

      const delShaRel = path.join(
        'scripts',
        'mcp',
        'atomic-edit',
        `.smoke-delete-sha.${process.pid}.ts`,
      );
      const delShaAbs = path.join(repoRoot, delShaRel);
      fs.writeFileSync(delShaAbs, 'export const SHA_GUARD = 1;\n');
      try {
        const delBadSha = (await client.callTool({
          name: 'atomic_delete_file',
          arguments: { file: delShaRel, expectedSha256: 'deadbeef' },
        })) as { content: { text: string }[]; isError?: boolean };
        check(
          'delete_file sha guard refuses stale hash',
          delBadSha.isError === true && /sha256 mismatch/.test(delBadSha.content[0]?.text ?? ''),
          delBadSha.content[0]?.text ?? '',
        );
      } finally {
        if (fs.existsSync(delShaAbs)) fs.unlinkSync(delShaAbs);
      }
    } finally {
      if (fs.existsSync(delAbs)) fs.unlinkSync(delAbs);
    }

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

    // analyzer transaction: ESLint proposes fixes in dry-run mode, atomic-edit writes them.
    const eslintRel = path.join('worker', `.smoke-eslint.${process.pid}.ts`);
    const eslintAbs = path.join(repoRoot, eslintRel);
    fs.writeFileSync(
      eslintAbs,
      'const envBackup = { TEST_FLAG: process.env.TEST_FLAG };\nexport function smoke(flag: boolean) {\n  if (flag) return 1;\n  return 0;\n}\n',
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
        summaryForHuman?: string;
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
          eslintTx.content[0]?.text.includes('npm --prefix worker run build') === true,
        JSON.stringify(eslintBody),
      );
      check(
        'eslint analyzer omits duplicate human summary from JSON',
        eslintBody.summary === undefined && eslintBody.summaryForHuman === undefined,
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
          traceBody.semanticImpact === 'lint_fix_auto_applied' &&
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
        const residueSummary = residueTx.content[0]?.text ?? '';
        const residueBody =
          residueTx.content.length > 1
            ? (JSON.parse(residueTx.content.at(-1)?.text ?? '{}') as {
                ok?: boolean;
                knownResidueFixesAppliedTotal?: number;
              })
            : undefined;
        const residueAfter = fs.readFileSync(residueAbs, 'utf8');
        check(
          'eslint analyzer applies known env residue fix',
          ((residueBody?.ok === true && residueBody.knownResidueFixesAppliedTotal === 1) ||
            (/Known residue fixes applied: 1/.test(residueSummary) &&
              residueTx.content.length === 1)) &&
            residueAfter.includes('afterEach') &&
            residueAfter.includes('process.env = { ...envBackup }') &&
            !residueAfter.includes('Object.assign(process.env, envBackup)'),
          residueSummary,
        );
        check(
          'eslint analyzer omits machine JSON when residue fully resolved',
          residueTx.content.length === 1 &&
            /Unresolved residue after known fixes: 0/.test(residueSummary),
          JSON.stringify(residueTx.content),
        );
      } finally {
        if (fs.existsSync(residueAbs)) fs.unlinkSync(residueAbs);
      }
    } finally {
      if (fs.existsSync(eslintAbs)) fs.unlinkSync(eslintAbs);
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
  // add_named_import: merge type-only specifier
  {
    const src = "import { A } from './m';\n";
    const r = await addNamedImport('a.ts', src, './m', 'B', undefined, true);
    check(
      'add_import merges type-only specifier',
      r.validation.ok && /import \{ A, type B \} from/.test(r.newText),
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
  // rename_property_key scoped rename preserves value
  {
    const src =
      "function build() {\n  const cfg = {\n    phone: '5511999999999',\n    on: true,\n  };\n  return cfg;\n}\n";
    const r = await renamePropertyKey('a.ts', src, 'phone', 'whatsappPhone', 'build');
    check(
      'rename_property_key scoped preserves value',
      r.validation.ok &&
        r.newText.includes("whatsappPhone: '5511999999999'") &&
        !r.newText.includes('phone:') &&
        r.newText.includes('on: true'),
      r.newText,
    );
  }
  // rename_property_key string-literal key preserves value
  {
    const src = "const o = { 'my-key': 42 };\n";
    const r = await renamePropertyKey('a.ts', src, 'my-key', 'newKey');
    check(
      'rename_property_key string-literal key preserves value',
      r.validation.ok && r.newText.includes('newKey: 42') && !r.newText.includes('my-key'),
      r.newText,
    );
  }
  // rename_property_key ambiguity refused
  {
    const src = 'const a = { k: 1 };\nconst b = { k: 2 };\n';
    let threw = false;
    try {
      await renamePropertyKey('a.ts', src, 'k', 'key');
    } catch {
      threw = true;
    }
    check('rename_property_key refuses ambiguity', threw);
  }
  // add_await_to_call: helper scoped await preserves args
  {
    const src = [
      'async function build() {',
      '  const ok = fetch("url", { method: "POST" });',
      '  return ok;',
      '}',
      '',
    ].join('\n');
    const r = await addAwaitToCall('a.ts', src, 'fetch', 'build');
    check(
      'add_await_to_call scoped preserves args',
      r.validation.ok &&
        r.newText.includes('await fetch("url", { method: "POST" })') &&
        r.newText.includes('async function build'),
      r.newText,
    );
    check(
      'add_await_to_call detail contains callText',
      (r.detail as { callText?: string }).callText === 'fetch("url", { method: "POST" })',
      JSON.stringify(r.detail),
    );
  }
  // add_await_to_call: missing callee refused
  {
    let threw = false;
    try {
      await addAwaitToCall('a.ts', 'async function f() { fn(); }\n', 'missing');
    } catch {
      threw = true;
    }
    check('add_await_to_call refuses missing callee', threw);
  }
  // add_await_to_call: ambiguity refused
  {
    const src = 'async function a() { fn(); }\nasync function b() { fn(); }\n';
    let threw = false;
    try {
      await addAwaitToCall('a.ts', src, 'fn');
    } catch {
      threw = true;
    }
    check('add_await_to_call refuses ambiguity', threw);
  }
  // add_await_to_call: ambiguity resolved by selector
  {
    const src = 'async function a() { fn(1); }\nasync function b() { fn(2); }\n';
    const r = await addAwaitToCall('a.ts', src, 'fn', 'a');
    check(
      'add_await_to_call selector resolves ambiguity',
      r.validation.ok && r.newText.includes('await fn(1)') && !r.newText.includes('await fn(2)'),
      r.newText,
    );
  }
  // add_await_to_call: already-awaited call refused
  {
    const src = 'async function f() { await fn(); }\n';
    let threw = false;
    try {
      await addAwaitToCall('a.ts', src, 'fn');
    } catch {
      threw = true;
    }
    check('add_await_to_call refuses already-awaited', threw);
  }
  // add_await_to_call: non-async context refused
  {
    const src = 'function f() { ok(); }\n';
    let threw = false;
    try {
      await addAwaitToCall('a.ts', src, 'ok', 'f');
    } catch {
      threw = true;
    }
    check('add_await_to_call refuses non-async context', threw);
  }
  // add_await_to_call: valid async wrap syntax-checked
  {
    const src = 'async function f() { ok(); }\n';
    const r = await addAwaitToCall('a.ts', src, 'ok', 'f');
    check(
      'add_await_to_call accepts valid async wrap',
      r.validation.ok && r.newText.includes('await ok()'),
      r.newText,
    );
  }
  // rename_property_key missing property refused
  {
    const src = 'const o = { a: 1 };\n';
    let threw = false;
    try {
      await renamePropertyKey('a.ts', src, 'missing', 'newKey');
    } catch {
      threw = true;
    }
    check('rename_property_key refuses missing property', threw);
  }
  // rename_property_key invalid identifier refused
  {
    const src = 'const o = { a: 1 };\n';
    let threw = false;
    try {
      await renamePropertyKey('a.ts', src, 'a', '1invalid');
    } catch {
      threw = true;
    }
    check('rename_property_key refuses invalid new key', threw);
  }
  // rename_property_key keyword refused by identifier guard
  {
    const src = 'const o = { a: 1 };\n';
    let threw = false;
    try {
      await renamePropertyKey('a.ts', src, 'a', 'for');
    } catch {
      threw = true;
    }
    check('rename_property_key refuses keyword new key', threw);
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

// ── Part H — worker-scope-check CLI ───────────────────────────────────────
function partH(): void {
  process.stdout.write('Part H — worker-scope-check CLI\n');

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsc-smoke-'));
  const wsc = path.join(__dirname, 'worker-scope-check.mjs');

  function runWsc(repoPath: string, extraArgs: string[]) {
    return childProcess.spawnSync(process.execPath, [wsc, '--repo', repoPath, ...extraArgs], {
      cwd: repoPath,
      encoding: 'utf8',
    });
  }

  try {
    childProcess.execFileSync('git', ['init'], { cwd: tempDir, stdio: 'ignore' });
    childProcess.execFileSync('git', ['config', 'user.email', 'smoke@test.com'], {
      cwd: tempDir,
      stdio: 'ignore',
    });
    childProcess.execFileSync('git', ['config', 'user.name', 'Smoke Test'], {
      cwd: tempDir,
      stdio: 'ignore',
    });

    fs.writeFileSync(path.join(tempDir, 'a.ts'), 'export const A = 1;\n');
    fs.writeFileSync(path.join(tempDir, 'b.ts'), 'export const B = 2;\n');
    fs.writeFileSync(path.join(tempDir, 'c.ts'), 'export const C = 3;\n');
    fs.mkdirSync(path.join(tempDir, 'sub'));
    fs.writeFileSync(path.join(tempDir, 'sub', 'd.ts'), 'export const D = 4;\n');

    childProcess.execFileSync('git', ['add', 'a.ts', 'b.ts'], { cwd: tempDir, stdio: 'ignore' });
    childProcess.execFileSync('git', ['commit', '-m', 'initial'], {
      cwd: tempDir,
      stdio: 'ignore',
    });

    fs.writeFileSync(path.join(tempDir, 'a.ts'), 'export const A = 99;\n');
    childProcess.execFileSync('git', ['add', 'c.ts'], { cwd: tempDir, stdio: 'ignore' });

    // Test 1: all changed files within precise allowlist → exit 0
    {
      const r = runWsc(tempDir, ['--allow', 'a.ts', '--allow', 'c.ts', '--allow', 'sub/d.ts']);
      check(
        'wsc: all files allowed exits 0',
        r.status === 0 && r.stdout.includes('\u2713 All changed files within allowlist'),
        `exit=${r.status} stdout=${r.stdout.substring(0, 200)}`,
      );
      check('wsc: marks allowed files with check', r.stdout.includes('\u2713 a.ts'), r.stdout);
    }

    // Test 2: file outside allowlist → exit 1
    {
      const r = runWsc(tempDir, ['--allow', 'c.ts']);
      check(
        'wsc: outsider detected exits 1',
        r.status === 1 && r.stdout.includes('VIOLATIONS'),
        `exit=${r.status} stdout=${r.stdout.substring(0, 200)}`,
      );
      check('wsc: marks violating file with cross', r.stdout.includes('\u2717 a.ts'), r.stdout);
    }

    // Test 3: required file present → exit 0
    {
      const r = runWsc(tempDir, [
        '--allow',
        'a.ts',
        '--allow',
        'c.ts',
        '--allow',
        'sub',
        '--require',
        'a.ts',
      ]);
      check(
        'wsc: required file present exits 0',
        r.status === 0,
        `exit=${r.status} stderr=${r.stderr}`,
      );
    }

    // Test 4: required file missing → exit 1
    {
      const r = runWsc(tempDir, ['--allow', 'a.ts', '--require', 'nonexistent.ts']);
      check(
        'wsc: missing required exits 1',
        r.status === 1 && r.stdout.includes('MISSING REQUIRED'),
        `exit=${r.status} stdout=${r.stdout.substring(0, 200)}`,
      );
      check('wsc: missing required names the file', r.stdout.includes('nonexistent.ts'), r.stdout);
    }

    // Test 5: --json output
    {
      const r = runWsc(tempDir, ['--allow', 'a.ts', '--allow', 'c.ts', '--allow', 'sub', '--json']);
      check('wsc: --json exits 0 when ok', r.status === 0, `exit=${r.status}`);
      let parsed = null;
      try {
        parsed = JSON.parse(r.stdout.trim());
      } catch {
        // fail below
      }
      check(
        'wsc: --json produces valid JSON',
        parsed !== null && typeof parsed.ok === 'boolean',
        r.stdout.substring(0, 200),
      );
      check('wsc: --json has changedFiles array', Array.isArray(parsed?.changedFiles), r.stdout);
      check('wsc: --json has violations array', Array.isArray(parsed?.violations), r.stdout);
      check(
        'wsc: --json has missingRequired array',
        Array.isArray(parsed?.missingRequired),
        r.stdout,
      );
    }

    // Test 5b: --json with violations → exit 1, violations filled
    {
      const r = runWsc(tempDir, ['--allow', 'b.ts', '--json']);
      check('wsc: --json with violations exits 1', r.status === 1, `exit=${r.status}`);
      const parsed = JSON.parse(r.stdout.trim());
      check('wsc: --json ok=false on violations', parsed.ok === false, r.stdout);
      check('wsc: --json violations lists outsiders', parsed.violations.length > 0, r.stdout);
    }

    // Test 6: directory-level allow path covers child files
    {
      const r = runWsc(tempDir, ['--allow', 'a.ts', '--allow', 'c.ts', '--allow', 'sub']);
      check(
        'wsc: dir allow covers child files',
        r.status === 0,
        `exit=${r.status} stdout=${r.stdout.substring(0, 200)}`,
      );
    }

    // Test 7: --allow . allows everything
    {
      const r = runWsc(tempDir, ['--allow', '.']);
      check(
        'wsc: --allow . permits all files',
        r.status === 0,
        `exit=${r.status} stdout=${r.stdout.substring(0, 200)}`,
      );
    }

    // Test 7b: .atomic traces are generated proof artifacts, not source-scope violations
    {
      fs.mkdirSync(path.join(tempDir, '.atomic', 'traces'), { recursive: true });
      fs.writeFileSync(path.join(tempDir, '.atomic', 'traces', 'trace.json'), '{}\n');
      const r = runWsc(tempDir, ['--allow', 'a.ts', '--allow', 'c.ts', '--allow', 'sub', '--json']);
      const parsed = JSON.parse(r.stdout.trim());
      check(
        'wsc: ignores .atomic proof traces',
        r.status === 0 && !parsed.changedFiles.some((f: string) => f.startsWith('.atomic')),
        r.stdout,
      );
    }

    // Test 8: no --allow flag (empty allowlist) → everything allowed
    {
      const r = runWsc(tempDir, []);
      check(
        'wsc: empty allowlist allows all',
        r.status === 0,
        `exit=${r.status} stdout=${r.stdout.substring(0, 200)}`,
      );
    }

    // Test 9: absolute --allow path rejected
    {
      const r = runWsc(tempDir, ['--allow', '/absolute/path.ts']);
      check(
        'wsc: absolute --allow rejected',
        r.status === 2 && r.stderr.includes('absolute'),
        `exit=${r.status} stderr=${r.stderr}`,
      );
    }

    // Test 10: relative path that escapes repo rejected
    {
      const r = runWsc(tempDir, ['--allow', '../outside.ts']);
      check(
        'wsc: outside-repo path rejected',
        r.status === 2,
        `exit=${r.status} stderr=${r.stderr}`,
      );
    }

    // Test 11: multiple --allow and --require flags work together
    {
      const r = runWsc(tempDir, [
        '--allow',
        'a.ts',
        '--allow',
        'c.ts',
        '--allow',
        'sub/d.ts',
        '--require',
        'a.ts',
        '--json',
      ]);
      check(
        'wsc: multi-flag combo exits 0',
        r.status === 0,
        `exit=${r.status} stdout=${r.stdout.substring(0, 200)}`,
      );
    }

    // Test 12: --repo flag targets the right directory
    {
      const r = runWsc(tempDir, ['--allow', 'a.ts', '--allow', 'c.ts', '--allow', 'sub']);
      check('wsc: --repo flag resolves cwd correctly', r.status === 0, `exit=${r.status}`);
    }

    // Test 13: CLI is truly read-only — repo untouched
    {
      const before = childProcess
        .execFileSync('git', ['status', '--porcelain=v1'], {
          cwd: tempDir,
          encoding: 'utf8',
        })
        .trim();
      runWsc(tempDir, ['--allow', 'a.ts']);
      runWsc(tempDir, ['--allow', 'nonexistent.ts', '--json']);
      const after = childProcess
        .execFileSync('git', ['status', '--porcelain=v1'], {
          cwd: tempDir,
          encoding: 'utf8',
        })
        .trim();
      check(
        'wsc: repo unchanged after invocations (read-only)',
        before === after,
        `before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
      );
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
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
  partH();
  process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
  process.stderr.write(`SMOKE CRASH: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}\n`);
  process.exit(2);
});
