/**
 * render-conformance-gate.proof.ts — standalone tsx proof.
 *
 *   npx tsx scripts/mcp/atomic-edit/gates/render-conformance-gate.proof.ts
 *
 * Proves the gate emits RED on a planted dead UI wire (a handler bound to nothing
 * AND a route pointing at no Next.js page) and GREEN on a fully-resolving
 * component. Also proves the honest-ceiling cases: inline-arrow / member-access
 * handlers are not red, a route landing on a dynamic segment is not red, and an
 * unobservable route tree returns `unjudged` rather than a false red.
 *
 * Self-builds via tsx; no shared dist. Asserts, prints PROOF PASS/FAIL, exits.
 */
import { makeContext } from './contract.js';
import gate, { extractAffordancesAst } from './render-conformance-gate.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let failures = 0;
function check(label: string, cond: boolean): void {
  if (cond) {
    console.log(`  ok   - ${label}`);
  } else {
    console.log(`  FAIL - ${label}`);
    failures++;
  }
}

// Build an isolated fake repo on a temp dir so route resolution is deterministic
// and never depends on the live frontend tree.
const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'render-conf-'));
function writeDisk(rel: string, content: string): void {
  const abs = path.join(repoRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, 'utf8');
}

// --- the route tree that exists on "disk" ---
// /dashboard resolves; /products/[id] is a dynamic leaf; everything else dangles.
writeDisk('frontend/src/app/(main)/dashboard/page.tsx', 'export default function P(){return null}');
writeDisk('frontend/src/app/(main)/products/[id]/page.tsx', 'export default function P(){return null}');
writeDisk('frontend/src/app/(public)/login/page.tsx', 'export default function P(){return null}');

async function main(): Promise<void> {
try {
  // ============================================================
  // CASE 1 — RED: a button handler bound to nothing + a route to no page.
  // ============================================================
  {
    const rel = 'frontend/src/components/DeadWires.tsx';
    const newText = [
      "'use client';",
      "import Link from 'next/link';",
      'export function DeadWires() {',
      '  return (',
      '    <div>',
      '      <button onClick={handleGhost}>click</button>',
      '      <Link href="/this-route-does-not-exist-zzz">go</Link>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    const overlay = new Map<string, string>([[rel, newText]]);
    const ctx = makeContext(repoRoot, overlay, [rel]);
    const r = (await gate.run(ctx)) as { green: boolean; reds: { fact: string }[]; unjudged?: boolean };
    check('CASE1 not green', r.green === false);
    check('CASE1 not unjudged', r.unjudged !== true);
    check(
      'CASE1 caught dangling handler {handleGhost}',
      r.reds.some((x) => x.fact.includes('handleGhost')),
    );
    check(
      'CASE1 caught dead route /this-route-does-not-exist-zzz',
      r.reds.some((x) => x.fact.includes('this-route-does-not-exist-zzz')),
    );
    console.log('  RED reds:', JSON.stringify(r.reds));
  }

  // ============================================================
  // CASE 2 — GREEN: every affordance resolves.
  //   handler is an imported symbol; routes hit real pages incl. a dynamic seg.
  // ============================================================
  {
    const rel = 'frontend/src/components/LiveWires.tsx';
    const newText = [
      "'use client';",
      "import Link from 'next/link';",
      "import { signOut } from '@/lib/auth';",
      'export function LiveWires({ onClose }: { onClose: () => void }) {',
      '  const goHome = () => {};',
      '  return (',
      '    <div>',
      '      <button onClick={signOut}>out</button>',
      '      <button onClick={onClose}>x</button>',
      '      <button onClick={goHome}>home</button>',
      '      <button onClick={() => doInline()}>inline</button>',
      '      <button onClick={obj.method}>member</button>',
      '      <Link href="/dashboard">dash</Link>',
      '      <Link href="/products/42">product</Link>',
      '      <Link href="/login">login</Link>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    const overlay = new Map<string, string>([[rel, newText]]);
    const ctx = makeContext(repoRoot, overlay, [rel]);
    const r = (await gate.run(ctx)) as { green: boolean; reds: { fact: string }[]; unjudged?: boolean };
    check('CASE2 green', r.green === true);
    check('CASE2 zero reds', r.reds.length === 0);
    check('CASE2 not unjudged', r.unjudged !== true);
    if (r.reds.length) console.log('  unexpected reds:', JSON.stringify(r.reds));
  }

  // ============================================================
  // CASE 3 — NEW-affordance-only: a pre-existing dead wire on DISK is NOT this
  //   write's claim. The overlay re-states it unchanged → must stay GREEN.
  // ============================================================
  {
    const rel = 'frontend/src/components/Legacy.tsx';
    const legacy = [
      "'use client';",
      'export function Legacy() {',
      '  return <button onClick={preExistingGhost}>old</button>;',
      '}',
    ].join('\n');
    writeDisk(rel, legacy); // prior content has the dead wire already
    const overlay = new Map<string, string>([[rel, legacy + '\n// touched\n']]);
    const ctx = makeContext(repoRoot, overlay, [rel]);
    const r = (await gate.run(ctx)) as { green: boolean; reds: unknown[] };
    check('CASE3 pre-existing dead wire does not block unrelated edit', r.green === true);
  }

  // ============================================================
  // CASE 4 — honest ceiling: route tree UNOBSERVABLE → unjudged, never red.
  // ============================================================
  {
    const emptyRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'render-conf-empty-'));
    const rel = 'frontend/src/components/RouteOnly.tsx';
    const newText = [
      "import Link from 'next/link';",
      'export function RouteOnly() {',
      '  return <Link href="/whatever">go</Link>;',
      '}',
    ].join('\n');
    const overlay = new Map<string, string>([[rel, newText]]);
    const ctx = makeContext(emptyRepo, overlay, [rel]);
    const r = (await gate.run(ctx)) as { green: boolean; reds: unknown[]; unjudged?: boolean };
    check('CASE4 unobservable route tree → unjudged', r.unjudged === true);
    check('CASE4 unobservable route tree → no false red', r.reds.length === 0);
    fs.rmSync(emptyRepo, { recursive: true, force: true });
  }

  // ============================================================
  // CASE 5 — THE LENS FIX: tokens that LOOK like dead wires but live inside a
  //   comment, a string literal, or a template literal are NOT affordances. The
  //   old whole-file regex extractor reddened every one of them (a comment example,
  //   a `title="onClick={x}"` attribute value, a code-building template string). The
  //   token-correct AST extractor sees them as comment / string / template_string
  //   nodes — never jsx_attribute / call_expression — so it extracts NONE of them.
  //   File must be GREEN: zero affordances declared → zero dead wires.
  // ============================================================
  {
    const rel = 'frontend/src/components/FalsePositives.tsx';
    const newText = [
      "'use client';",
      'export function FalsePositives() {',
      '  // onClick={ghostInLineComment} href="/dead-route-in-comment-zzz"',
      '  /* router.push("/dead-route-in-block-comment-zzz") */',
      '  const codeGen = `onClick={ghostInTemplate} href="/dead-route-in-template-zzz" router.push("/dead-template-push-zzz")`;',
      '  const blurb = "onClick={ghostInString} navigate to /dead-route-in-string-zzz";',
      '  void codeGen; void blurb;',
      '  return (',
      // a REAL attribute whose VALUE-string merely contains "onClick={...}" text:
      '    <div title="onClick={ghostInAttrValue}" aria-label="go to /dead-route-in-attr-value-zzz">',
      '      <span>no real wire here</span>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    const overlay = new Map<string, string>([[rel, newText]]);
    const ctx = makeContext(repoRoot, overlay, [rel]);
    const r = (await gate.run(ctx)) as { green: boolean; reds: { fact: string }[]; unjudged?: boolean };
    check('CASE5 string/comment/template lookalikes do NOT red (FP removed)', r.green === true);
    check('CASE5 zero reds (no affordance extracted from non-code nodes)', r.reds.length === 0);
    check('CASE5 not unjudged (file parsed; a real GREEN verdict)', r.unjudged !== true);
    // Belt-and-suspenders: prove the extractor itself returns NO affordance for any
    // of the lookalike tokens — none of these strings may surface as a wire.
    const aff = await extractAffordancesAst(newText, rel);
    check('CASE5 extractor returned a real (non-null) parse', aff !== null);
    check(
      'CASE5 extractor found ZERO affordances among the lookalikes',
      (aff ?? []).length === 0,
    );
    if ((aff ?? []).length) console.log('  LEAKED affordances:', JSON.stringify(aff));
    if (r.reds.length) console.log('  unexpected reds:', JSON.stringify(r.reds));
  }
} finally {
  fs.rmSync(repoRoot, { recursive: true, force: true });
}

  if (failures === 0) {
    console.log('PROOF PASS');
    process.exit(0);
  } else {
    console.log(`PROOF FAIL (${failures} failed assertion(s))`);
    process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error(e);
  console.log('PROOF FAIL (threw)');
  process.exit(1);
});
