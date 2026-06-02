/**
 * contract-edge-gate.proof.ts — standalone tsx proof of the CONTRACT-EDGE fact.
 *
 *   npx tsx scripts/mcp/atomic-edit/gates/contract-edge-gate.proof.ts
 *
 * Self-builds via tsx (no shared dist). Grounds against the REAL repo producer
 * universe (controllers on disk under backend/src + emit sites under backend/worker),
 * then plants brand-new consumer files in the overlay and asserts:
 *
 *   RED  — a NEW apiFetch path under a backend-owned namespace ('products') with an
 *          arity/literal that matches NO controller route → dangling call. Plus a
 *          NEW @OnEvent('…') listener whose event nobody emits → dangling listener.
 *   GREEN — a NEW apiFetch('/products/stats') that DOES resolve to a real controller
 *          route (proven present in the openapi extract) → no red.
 *   NOT_APPLICABLE — a changed file with no decidable consumer edge → explicitly
 *          not applicable, not unjudged.
 *   FP-RESIDUAL — a file whose ONLY @OnEvent('…') / apiFetch('/products/…') tokens
 *          live inside a comment and a template literal. Because the rewrite reads
 *          through perception (real `decorator` / `call_expression` AST nodes), those
 *          tokens are `comment` / `template_string` nodes — NOT extracted — so the
 *          file is NOT_APPLICABLE with ZERO reds. The old whole-file-regex extractor would
 *          have reddened the template @OnEvent as a dangling listener. This case is
 *          the concrete proof the string/comment/template false-positive is gone.
 *
 * Each planted file is BRAND-NEW (no disk prior) so every edge is a NEW edge under
 * the gate's NEW-edge-only semantics. run is now async (perception is async); the
 * proof awaits it.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeContext } from './contract.js';
import gate from './contract-edge-gate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function findRepoRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (
      fs.existsSync(path.join(dir, 'backend/src')) &&
      fs.existsSync(path.join(dir, 'frontend/src')) &&
      fs.existsSync(path.join(dir, 'scripts/mcp/atomic-edit'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`could not find repo root from ${start}`);
    }
    dir = parent;
  }
}

const repoRoot = findRepoRoot(HERE);

let failures = 0;
const check = (label: string, cond: boolean): void => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} — ${label}`);
  if (!cond) failures++;
};

async function main(): Promise<void> {
  /* ───────────────────────── RED case ───────────────────────── */
  // Brand-new consumer file with a dangling HTTP call + a dangling @OnEvent listener.
  const redRel = 'frontend/src/lib/api/__contract_edge_red__.ts';
  const redText = `
import { apiFetch } from './core';
export const x = {
  // 'products' IS owned by controllers, but this 5-segment shape matches no route:
  dangling: () => apiFetch<unknown>('/products/this/route/does/not-exist'),
};
import { OnEvent } from '@nestjs/event-emitter';
export class Listener {
  @OnEvent('totally.unemitted.phantom_event')
  handle(): void { /* no .emit ever produces this */ }
}
`;
  const redOverlay = new Map<string, string>([[redRel, redText]]);
  const redCtx = makeContext(repoRoot, redOverlay, [redRel]);
  const red = await gate.run(redCtx);

  console.log('\n[RED] reds:');
  for (const r of red.reds) console.log(`   - ${r.locus ?? ''}  ::  ${r.fact}`);

  check('RED: gate is not green', red.green === false);
  check('RED: not unjudged (it decided)', red.unjudged !== true);
  check(
    'RED: caught the dangling HTTP call',
    red.reds.some((r) => r.fact.includes('resolves to no controller route') && r.locus?.includes('not-exist')),
  );
  check(
    'RED: caught the dangling @OnEvent listener',
    red.reds.some((r) => r.fact.includes('has no producer') && r.locus?.includes('totally.unemitted.phantom_event')),
  );

  /* ───────────────────────── GREEN case ───────────────────────── */
  // Brand-new consumer file whose apiFetch path DOES resolve to a real controller route.
  // '/products/stats' is in the openapi extract (ProductController @Get('stats')).
  const greenRel = 'frontend/src/lib/api/__contract_edge_green__.ts';
  const greenText = `
import { apiFetch } from './core';
export const y = {
  stats: () => apiFetch<Record<string, unknown>>('/products/stats'),
};
`;
  const greenOverlay = new Map<string, string>([[greenRel, greenText]]);
  const greenCtx = makeContext(repoRoot, greenOverlay, [greenRel]);
  const greenR = await gate.run(greenCtx);

  console.log(`\n[GREEN] green=${greenR.green} reds=${greenR.reds.length} unjudged=${greenR.unjudged ?? false}`);
  check('GREEN: resolving call produces no red', greenR.green === true);
  check('GREEN: it actually judged (not unjudged)', greenR.unjudged !== true);

  /* ───────────────────── NOT_APPLICABLE case ───────────────────── */
  // Changed file with no consumer edge has no contract-edge fact to assert.
  const unjRel = 'frontend/src/lib/__contract_edge_not_applicable__.ts';
  const unjText = `export const z = 1 + 2; // no apiFetch, no @OnEvent — nothing to assert\n`;
  const unjOverlay = new Map<string, string>([[unjRel, unjText]]);
  const unjCtx = makeContext(repoRoot, unjOverlay, [unjRel]);
  const unjR = await gate.run(unjCtx);

  console.log(`\n[NOT_APPLICABLE] green=${unjR.green} reds=${unjR.reds.length} notApplicable=${unjR.notApplicable ?? false} unjudged=${unjR.unjudged ?? false}`);
  check('NOT_APPLICABLE: returns notApplicable when no contract edge exists', unjR.notApplicable === true);
  check('NOT_APPLICABLE: is not unjudged', unjR.unjudged !== true);
  check('NOT_APPLICABLE: emits zero reds', unjR.reds.length === 0);

  /* ─────────────────── FP-RESIDUAL (the lens's exposure) ─────────────────── */
  // A file whose ONLY @OnEvent('…') and apiFetch('/products/…') tokens live inside a
  // COMMENT and a TEMPLATE LITERAL. Under the old whole-file regex these matched and
  // the template @OnEvent reddened as a dangling listener. Under perception they are
  // `comment` / `template_string` nodes — never `decorator` / `call_expression` — so
  // NOTHING is extracted → the file is NOT_APPLICABLE with ZERO reds. This is the concrete
  // proof the string/comment/template false-positive is gone.
  const fpRel = 'frontend/src/lib/api/__contract_edge_fp__.ts';
  const fpText = [
    "// docs: register a listener via @OnEvent('phantom.in.comment') and call apiFetch('/products/in/comment')",
    'export const codegen = () => {',
    "  // a meta-code template that BUILDS source text containing the patterns, but is itself just a string:",
    "  const generated = `",
    "    @OnEvent('phantom.in.template')",
    "    handler() { return apiFetch('/products/in/template/that/does/not/exist'); }",
    '  `;',
    '  return generated.length;',
    '};',
    '',
  ].join('\n');
  const fpOverlay = new Map<string, string>([[fpRel, fpText]]);
  const fpCtx = makeContext(repoRoot, fpOverlay, [fpRel]);
  const fpR = await gate.run(fpCtx);

  console.log(`\n[FP-RESIDUAL] green=${fpR.green} reds=${fpR.reds.length} notApplicable=${fpR.notApplicable ?? false} unjudged=${fpR.unjudged ?? false}`);
  for (const r of fpR.reds) console.log(`   - LEAKED ${r.locus ?? ''}  ::  ${r.fact}`);
  check('FP-RESIDUAL: zero reds (no comment/template token extracted)', fpR.reds.length === 0);
  check('FP-RESIDUAL: notApplicable (nothing real to judge — the FP is gone)', fpR.notApplicable === true);
  check('FP-RESIDUAL: not unjudged', fpR.unjudged !== true);
  check(
    'FP-RESIDUAL: the template @OnEvent did NOT red as a dangling listener',
    !fpR.reds.some((r) => r.fact.includes('phantom.in.template')),
  );
  check(
    'FP-RESIDUAL: the comment apiFetch path did NOT red as a dangling call',
    !fpR.reds.some((r) => r.locus?.includes('in/comment') || r.locus?.includes('in/template')),
  );

  /* ───────────────────────── NEW-edge-only guard ───────────────────────── */
  // A real EXISTING file (has a disk prior) whose CURRENT content equals disk → its
  // existing edges are NOT new → must not be reddened even if some legacy edge dangled.
  const realRel = 'frontend/src/lib/api/products.ts';
  const realText = redCtx.readFile(realRel); // overlay-aware read = disk here
  if (realText !== null) {
    const sameOverlay = new Map<string, string>([[realRel, realText]]);
    const sameCtx = makeContext(repoRoot, sameOverlay, [realRel]);
    const sameR = await gate.run(sameCtx);
    check('NEW-EDGE-ONLY: unchanged on-disk file introduces no new-edge red', sameR.reds.length === 0);
  } else {
    check('NEW-EDGE-ONLY: products.ts present to test (skipped if absent)', true);
  }

  console.log(failures === 0 ? '\nPROOF PASS' : `\nPROOF FAIL (${failures} assertion(s) failed)`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
