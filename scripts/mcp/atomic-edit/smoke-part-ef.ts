import { fileURLToPath } from 'node:url';
import { applyEdits } from './engine.js';
import { graphemes, measure, graphemeLength } from './textunit.js';
import { characterDiff } from './advanced.js';
import { check } from './smoke-state.js';

const __filename = fileURLToPath(import.meta.url);
// ── Part E — text-unit / Unicode safety (lever #2) ───────────────────────
export function partE(): void {
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
export function partF(): void {
  // python: delete a ')' → structural regression refused
  {
    const r = applyEdits('m.py', 'def f(a, b):\n    return (a + b)\n', [
      { start: { line: 2, column: 18 }, end: { line: 2, column: 19 }, newText: '' },
    ]);
    check(
      'struct: py unbalanced paren refused',
      // Refused regardless of which parser caught it: the native/python tree-sitter
      // (language:'python') when available, else the structural-balance fallback
      // (language:'structural'). Both are valid; the contract is ok===false.
      r.validation.ok === false &&
        (r.validation.language === 'structural' || r.validation.language === 'python'),
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

