/**
 * gates/findings-delta-gate.proof.ts — standalone tsx proof for the findings-delta gate.
 *
 *   npx tsx scripts/mcp/atomic-edit/gates/findings-delta-gate.proof.ts
 *
 * Self-builds via tsx (no shared dist). Proves the ONE fact in BOTH directions:
 *   RED  — a candidate that INTRODUCES a new pure-text single-file finding
 *          (a `debugger;` / a duplicate `case`) that the prior bytes did NOT have.
 *   GREEN — a candidate whose only finding was ALREADY in the prior bytes
 *          (NEW-only delta: a pre-existing finding is not this write's claim).
 *   GREEN — a clean candidate with no findings at all.
 *   UNJUDGED-honest — a change set with no judgeable source file.
 *   DEFER — a type-aware rule (no-unsafe-assignment) is NOT emitted (ceiling).
 *
 * Uses real on-disk pre-images by writing fixtures into a temp dir under the repo
 * so priorContent reads the true disk "before", then overlaying the candidate.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { makeContext } from './contract.js';
import gate, { TYPE_AWARE_DEFERRED } from './findings-delta-gate.js';

let failures = 0;
const check = (label: string, cond: boolean): void => {
  // eslint-disable-next-line no-console
  console.log(`${cond ? 'ok  ' : 'FAIL'} — ${label}`);
  if (!cond) failures++;
};

// A real, throwaway repo root so prior-content disk reads are genuine.
const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'findings-delta-proof-'));
const writeDisk = (rel: string, content: string): void => {
  const abs = path.join(repoRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
};

async function main(): Promise<void> {
  // ─────────────────────────────────────────────────────────────────────────
  // CASE 1 — RED: candidate INTRODUCES a `debugger;` the prior bytes lacked.
  // ─────────────────────────────────────────────────────────────────────────
  const f1 = 'src/a.ts';
  writeDisk(f1, 'export function a(): number {\n  return 1;\n}\n');
  const candidate1 = 'export function a(): number {\n  debugger;\n  return 1;\n}\n';
  const ctx1 = makeContext(repoRoot, new Map([[f1, candidate1]]), [f1]);
  const r1 = (await gate.run(ctx1)) as { green: boolean; reds: { file: string; locus?: string; fact: string }[]; unjudged?: boolean };
  const res1 = r1;
  check('RED — introducing `debugger;` reddens the gate', res1.green === false);
  check('RED — exactly one new finding emitted', res1.reds.length === 1);
  check('RED — red is the no-debugger fact at the right file', res1.reds[0]?.fact.includes('no-debugger') && res1.reds[0]?.file === f1);
  check('RED — locus pins L2 (the debugger line)', res1.reds[0]?.locus === 'L2:3');
  // eslint-disable-next-line no-console
  console.log('     GateRed:', JSON.stringify(res1.reds[0]));

  // ─────────────────────────────────────────────────────────────────────────
  // CASE 2 — GREEN: the `debugger;` was ALREADY in the prior bytes (NEW-only).
  // ─────────────────────────────────────────────────────────────────────────
  const f2 = 'src/b.ts';
  writeDisk(f2, 'export function b(): void {\n  debugger;\n}\n');
  const candidate2 = 'export function b(): void {\n  debugger;\n  // unrelated edit\n  return;\n}\n';
  const ctx2 = makeContext(repoRoot, new Map([[f2, candidate2]]), [f2]);
  const res2 = (await gate.run(ctx2)) as { green: boolean; reds: unknown[] };
  check('GREEN — pre-existing finding does not block an unrelated edit', res2.green === true && res2.reds.length === 0);

  // ─────────────────────────────────────────────────────────────────────────
  // CASE 3 — RED: candidate INTRODUCES a duplicate `case` label.
  // ─────────────────────────────────────────────────────────────────────────
  const f3 = 'src/c.ts';
  writeDisk(f3, 'export function c(x: number): string {\n  switch (x) {\n    case 1: return "a";\n    case 2: return "b";\n  }\n  return "z";\n}\n');
  const candidate3 = 'export function c(x: number): string {\n  switch (x) {\n    case 1: return "a";\n    case 2: return "b";\n    case 1: return "dup";\n  }\n  return "z";\n}\n';
  const ctx3 = makeContext(repoRoot, new Map([[f3, candidate3]]), [f3]);
  const res3 = (await gate.run(ctx3)) as { green: boolean; reds: { fact: string }[] };
  check('RED — introducing a duplicate case reddens the gate', res3.green === false);
  check('RED — red is the no-duplicate-case fact', res3.reds.some((r) => r.fact.includes('no-duplicate-case')));

  // ─────────────────────────────────────────────────────────────────────────
  // CASE 4 — GREEN: clean candidate, brand-new file, no findings.
  // ─────────────────────────────────────────────────────────────────────────
  const f4 = 'src/d.ts';
  const candidate4 = 'export const d = (n: number): number => n * 2;\n';
  const ctx4 = makeContext(repoRoot, new Map([[f4, candidate4]]), [f4]);
  const res4 = (await gate.run(ctx4)) as { green: boolean; reds: unknown[] };
  check('GREEN — clean new file raises nothing', res4.green === true && res4.reds.length === 0);

  // ─────────────────────────────────────────────────────────────────────────
  // CASE 5 — UNJUDGED-honest: change set with no judgeable source file.
  // ─────────────────────────────────────────────────────────────────────────
  const f5 = 'README.md';
  const ctx5 = makeContext(repoRoot, new Map([[f5, '# hello\n']]), [f5]);
  const res5 = (await gate.run(ctx5)) as { green: boolean; unjudged?: boolean };
  check('UNJUDGED — no source file to judge → unjudged:true, not fake-green', res5.unjudged === true);

  // ─────────────────────────────────────────────────────────────────────────
  // CASE 6 — CEILING: a debugger hidden inside a STRING is NOT a finding
  //          (proves token-correct AST perception, not a text scan).
  // ─────────────────────────────────────────────────────────────────────────
  const f6 = 'src/e.ts';
  writeDisk(f6, 'export const e = 1;\n');
  const candidate6 = 'export const e = 1;\nexport const msg = "use the debugger statement";\n';
  const ctx6 = makeContext(repoRoot, new Map([[f6, candidate6]]), [f6]);
  const res6 = (await gate.run(ctx6)) as { green: boolean; reds: unknown[] };
  check('GREEN — `debugger` inside a string literal is not a finding (token-correct)', res6.green === true && res6.reds.length === 0);

  // ─────────────────────────────────────────────────────────────────────────
  // CASE 6b — REGEX FP REMOVED: a `debugger` inside a REGEX literal is NOT a
  //           finding. The old whole-file-regex + blankNonCode lexer did not
  //           model regex literals, so `/debugger/` whole-file-matched and the
  //           gate false-positived. The AST rewrite makes it a `regex` node, not
  //           a `debugger_statement`, so it is never extracted. This is the
  //           concrete residual the lens exposed, now gone.
  // ─────────────────────────────────────────────────────────────────────────
  const f6b = 'src/eb.ts';
  writeDisk(f6b, 'export const x = 1;\n');
  const candidate6b = 'export const x = 1;\nexport const re = /debugger/;\n';
  const ctx6b = makeContext(repoRoot, new Map([[f6b, candidate6b]]), [f6b]);
  const res6b = (await gate.run(ctx6b)) as { green: boolean; reds: { fact: string }[] };
  check('GREEN — `debugger` inside a REGEX literal is not a finding (FP removed)', res6b.green === true && res6b.reds.length === 0);

  // ─────────────────────────────────────────────────────────────────────────
  // CASE 6c — NESTED-SWITCH SCOPING: a duplicate label in an INNER switch is a
  //           finding; identical labels across DIFFERENT switches are NOT a
  //           cross-switch false duplicate (innermost-switch_body grouping).
  // ─────────────────────────────────────────────────────────────────────────
  const f6c = 'src/ec.ts';
  writeDisk(f6c, 'export const placeholder = 0;\n');
  const candidate6c =
    'export function n(a: number, b: number): string {\n' +
    '  switch (a) {\n' +
    '    case 1:\n' +
    '      switch (b) { case 1: return "x"; case 1: return "y"; }\n' +
    '      return "z";\n' +
    '    case 2: return "w";\n' +
    '  }\n' +
    '  return "q";\n' +
    '}\n';
  const ctx6c = makeContext(repoRoot, new Map([[f6c, candidate6c]]), [f6c]);
  const res6c = (await gate.run(ctx6c)) as { green: boolean; reds: { fact: string }[] };
  check('RED — duplicate label inside the INNER switch is a finding', res6c.green === false);
  check('RED — exactly ONE duplicate-case (no cross-switch false dup of outer `case 1`)', res6c.reds.length === 1 && res6c.reds[0]?.fact.includes('no-duplicate-case'));

  // ─────────────────────────────────────────────────────────────────────────
  // CASE 7 — DEFER: the type-aware frontier is documented and NOT emittable.
  //          We never produce a no-unsafe-* red — it belongs to the effect gate.
  // ─────────────────────────────────────────────────────────────────────────
  const f7 = 'src/f.ts';
  writeDisk(f7, 'export const f = 1;\n');
  // This file WOULD raise @typescript-eslint/no-unsafe-assignment under a typed
  // eslint run, but it is type-aware: our byte gate must stay silent on it.
  const candidate7 = 'declare const danger: any;\nexport const f: number = danger;\n';
  const ctx7 = makeContext(repoRoot, new Map([[f7, candidate7]]), [f7]);
  const res7 = (await gate.run(ctx7)) as { green: boolean; reds: { fact: string }[] };
  const emittedTypeAware = res7.reds.some((r) =>
    [...TYPE_AWARE_DEFERRED].some((rule) => r.fact.includes(rule)),
  );
  check('DEFER — no type-aware (no-unsafe-*) red is ever emitted (ceiling honored)', emittedTypeAware === false);
  check('DEFER — type-aware frontier set is non-empty and documented', TYPE_AWARE_DEFERRED.size >= 12);

  // ─────────────────────────────────────────────────────────────────────────
  // Identity checks on the GateModule shape.
  // ─────────────────────────────────────────────────────────────────────────
  check('SHAPE — name is findings-delta', gate.name === 'findings-delta');
  check('SHAPE — kind is static', gate.kind === 'static');
  check('SHAPE — appliesTo(.ts)=true, appliesTo(.md)=false', gate.appliesTo('x.ts') === true && gate.appliesTo('x.md') === false);
}

main()
  .catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(err);
    failures++;
  })
  .finally(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
    if (failures === 0) {
      // eslint-disable-next-line no-console
      console.log('\nPROOF PASS');
      process.exit(0);
    } else {
      // eslint-disable-next-line no-console
      console.log(`\nPROOF FAIL — ${failures} assertion(s) failed`);
      process.exit(1);
    }
  });
