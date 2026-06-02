import { fileURLToPath } from 'node:url';
import {
  applyEdits, replaceText, renameSymbol, replaceLiteral, posToOffset, wrapRange,
} from './engine.js';
import { check } from './smoke-state.js';

const __filename = fileURLToPath(import.meta.url);

export async function partA(): Promise<void> {
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
