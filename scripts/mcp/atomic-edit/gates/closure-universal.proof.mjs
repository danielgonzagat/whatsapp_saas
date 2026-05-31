#!/usr/bin/env node
/**
 * closure-universal.proof.mjs — standalone node proof for the UNIVERSAL closure.
 *
 * Run:  node scripts/mcp/atomic-edit/build.mjs \
 *    && node scripts/mcp/atomic-edit/gates/closure-universal.proof.mjs
 *
 * (build.mjs must include gates/closure-universal.ts in ENTRY so dist emits it —
 *  the integrator wires that single ENTRY line; see closure-universal.ts honesty note.)
 *
 * Asserts BOTH polarities — green where it should be green, RED/UNJUDGED where it
 * should be, never green-by-assumption — across:
 *
 *   LANG-DETECT  — langOf maps known extensions, returns null for an unknown one.
 *   PY-CLOSURE   — a python file importing a sibling produces a closure containing
 *                  that sibling (POSITIVE), and NOT an unrelated file (NEGATIVE).
 *   TS-CLOSURE   — a TS file importing a sibling produces the right closure too,
 *                  proving the universal provider subsumes algebra's TS-only one.
 *   UNKNOWN-LANG — a .swift file returns the REFLEXIVE-ONLY closure {self} with an
 *                  unjudged note — never a wrong-but-confident {} that would let two
 *                  coupled edits be called independent.
 *   AST-CORRECT  — the async AST extractor excludes an import-shaped token that lives
 *                  inside a STRING/comment (token-correct), while the sync regex layer
 *                  is the documented permissive superset (conservative).
 *   PROVIDER     — makeUniversalClosureProvider yields a ClosureProvider-shaped fn
 *                  ((repoRoot, rel) → {set:Set, capped:boolean}); a malformed shape is
 *                  rejected by the same guard.
 *   PER-GATE     — routeLoci / eventLoci surface namespaced virtual loci, and the
 *                  per-gate provider ADDS them to the file closure (POSITIVE) while the
 *                  'file' gate does NOT (NEGATIVE) — so two edits sharing a route/event
 *                  couple at a virtual locus a file-only closure cannot express.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(dir, '..', 'dist', 'gates', 'closure-universal.js');
if (!fs.existsSync(distPath)) {
  console.log('  FAIL  dist not built — add gates/closure-universal.ts to build.mjs ENTRY, then re-run build.mjs');
  console.log('\n0 passed, 1 failed');
  process.exit(1);
}
const C = await import(distPath);
const {
  langOf, supportedLanguages, resolveSpec, extractSpecs, extractSpecsSync,
  universalClosureOf, makeUniversalClosureProvider, routeLoci, eventLoci, makeGateClosureProvider,
} = C;

let pass = 0;
let fail = 0;
const check = (name, cond) => {
  if (cond) { pass += 1; console.log('  PASS ', name); }
  else { fail += 1; console.log('  FAIL ', name); }
};

// ── LANG-DETECT ───────────────────────────────────────────────────────────────
check('LANG-DETECT .py → python', langOf('a/b/c.py') === 'python');
check('LANG-DETECT .ts → typescript', langOf('x.ts') === 'typescript');
check('LANG-DETECT .go → go', langOf('m.go') === 'go');
check('LANG-DETECT unknown .swift → null (UNJUDGED, not guessed)', langOf('App.swift') === null);
check('LANG-DETECT supportedLanguages is a non-trivial set', Array.isArray(supportedLanguages()) && supportedLanguages().includes('python') && supportedLanguages().includes('ruby') && supportedLanguages().length >= 6);

// ── PY-CLOSURE: a python file importing a sibling ───────────────────────────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'closure-uni-py-'));
  fs.writeFileSync(path.join(tmp, 'helper.py'), 'def greet():\n    return 1\n');
  fs.writeFileSync(path.join(tmp, 'unrelated.py'), 'X = 2\n');
  fs.writeFileSync(path.join(tmp, 'main.py'), 'from .helper import greet\n\nprint(greet())\n');
  const { set } = universalClosureOf(tmp, 'main.py');
  check('PY-CLOSURE reflexive on main.py', set.has('main.py'));
  check('PY-CLOSURE contains sibling helper.py (POSITIVE)', set.has('helper.py'));
  check('PY-CLOSURE excludes unrelated.py (NEGATIVE)', !set.has('unrelated.py'));
  // direct resolveSpec sanity
  check('PY-CLOSURE resolveSpec .helper → helper.py', resolveSpec(tmp, 'main.py', 'python', '.helper') === 'helper.py');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── TS-CLOSURE: universal provider subsumes the TS-only one ─────────────────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'closure-uni-ts-'));
  fs.writeFileSync(path.join(tmp, 'a.ts'), 'export const foo = 1;\n');
  fs.writeFileSync(path.join(tmp, 'c.ts'), 'export const baz = 2;\n');
  fs.writeFileSync(path.join(tmp, 'b.ts'), "import { foo } from './a';\nexport const bar = foo + 1;\n");
  const { set } = universalClosureOf(tmp, 'b.ts');
  check('TS-CLOSURE b.ts closure contains imported a.ts (POSITIVE)', set.has('a.ts'));
  check('TS-CLOSURE b.ts closure excludes unrelated c.ts (NEGATIVE)', !set.has('c.ts'));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── UNKNOWN-LANG: reflexive-only + unjudged, never a confident wrong {} ─────────
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'closure-uni-unk-'));
  fs.writeFileSync(path.join(tmp, 'App.swift'), 'import Sibling\nlet x = 1\n');
  fs.writeFileSync(path.join(tmp, 'Sibling.swift'), 'let y = 2\n');
  const { set, capped } = universalClosureOf(tmp, 'App.swift');
  check('UNKNOWN-LANG closure is reflexive {self} only', set.has('App.swift') && set.size === 1);
  check('UNKNOWN-LANG does NOT confidently claim Sibling.swift (honest floor)', !set.has('Sibling.swift'));
  check('UNKNOWN-LANG not capped (small)', capped === false);
  const ex = extractSpecsSync('App.swift', 'import Sibling\n');
  check('UNKNOWN-LANG extractSpecsSync marks perception UNJUDGED', ex.perception === 'unjudged' && ex.specs.length === 0 && /UNJUDGED/.test(ex.note));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ── AST-CORRECT: token-correct AST excludes string/comment-embedded specifiers ──
{
  // A python source where an import-shaped token lives ONLY inside a string literal.
  const sourceWithStringToken = 'x = "from .ghost import nope"\nfrom .real import thing\n';
  const ast = await extractSpecs('m.py', sourceWithStringToken);
  const regex = extractSpecsSync('m.py', sourceWithStringToken);
  if (ast.perception === 'ast') {
    // token-correct: the string-embedded `.ghost` is NOT inside an import node → excluded;
    // the genuine `.real` import IS captured.
    check('AST-CORRECT real import .real captured (POSITIVE)', ast.specs.includes('.real'));
    check('AST-CORRECT string-embedded .ghost excluded (token-correct NEGATIVE)', !ast.specs.includes('.ghost'));
  } else {
    // No grammar in this environment → we honestly fell back to regex. Assert the
    // documented fallback contract instead of pretending the AST ran (no green-by-assumption).
    check('AST-CORRECT honest fallback to regex when no grammar', ast.perception === 'regex' && /conservative|regex/.test(ast.note));
  }
  // The regex superset is permissive BY DESIGN (conservative pole) — it may include
  // the string-embedded token. We assert it is at least a superset of the real specs.
  check('AST-CORRECT regex layer is a permissive superset (captures real .real)', regex.specs.includes('.real'));
  console.log(`        (AST extractor perception=${ast.perception}; note=${ast.note})`);
}

// ── PROVIDER: ClosureProvider shape, positive + negative ────────────────────────
{
  const provider = makeUniversalClosureProvider();
  const isClosureProvider = (fn) => {
    if (typeof fn !== 'function') return false;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'closure-uni-prov-'));
    fs.writeFileSync(path.join(tmp, 'p.ts'), 'export const k = 1;\n');
    const r = fn(tmp, 'p.ts');
    const ok = r && r.set instanceof Set && typeof r.capped === 'boolean' && r.set.has('p.ts');
    fs.rmSync(tmp, { recursive: true, force: true });
    return ok;
  };
  check('PROVIDER makeUniversalClosureProvider satisfies ClosureProvider (POSITIVE)', isClosureProvider(provider));
  // NEGATIVE: a malformed provider returning an array (not {set,capped}) is rejected by the same guard.
  const bad = (_root, rel) => [rel];
  check('PROVIDER malformed array-returning provider rejected (NEGATIVE)', isClosureProvider(bad) === false);
}

// ── PER-GATE: virtual route/event loci couple cross-file at a non-path locus ────
{
  const routeSrc = "@Post('/checkout')\nasync create() {}\n";
  const eventSrc = "@OnEvent('order.created')\nhandle() {}\nthis.emitter.emit('order.created', x);\n";
  const rl = routeLoci(routeSrc);
  const el = eventLoci(eventSrc);
  check('PER-GATE routeLoci surfaces namespaced route:checkout', rl.includes('route:checkout'));
  check('PER-GATE eventLoci surfaces namespaced event:order.created', el.includes('event:order.created'));
  check('PER-GATE no virtual locus aliases a real path (namespace prefix present)', rl.every((l) => l.startsWith('route:')) && el.every((l) => l.startsWith('event:')));

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'closure-uni-gate-'));
  fs.writeFileSync(path.join(tmp, 'ctrl.ts'), routeSrc);
  const fileGate = makeGateClosureProvider('file')(tmp, 'ctrl.ts');
  const routeGate = makeGateClosureProvider('route')(tmp, 'ctrl.ts');
  // POSITIVE: route gate adds the virtual locus; NEGATIVE: file gate does not.
  check('PER-GATE route gate ADDS virtual route locus (POSITIVE)', routeGate.set.has('route:checkout'));
  check('PER-GATE file gate does NOT add virtual route locus (NEGATIVE)', !fileGate.set.has('route:checkout'));
  check('PER-GATE both gates remain reflexive on the file', fileGate.set.has('ctrl.ts') && routeGate.set.has('ctrl.ts'));
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
