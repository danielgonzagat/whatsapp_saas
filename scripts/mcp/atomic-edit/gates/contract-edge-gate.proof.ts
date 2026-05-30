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
 *   UNJUDGED — a changed file with no decidable consumer edge → unjudged, not green.
 *
 * Each planted file is BRAND-NEW (no disk prior) so every edge is a NEW edge under
 * the gate's NEW-edge-only semantics.
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeContext } from './contract.js';
import gate from './contract-edge-gate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(HERE, '..', '..', '..', '..'); // gates → atomic-edit → mcp → scripts → repo

let failures = 0;
const check = (label: string, cond: boolean): void => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} — ${label}`);
  if (!cond) failures++;
};

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
const redRes = gate.run(redCtx) as ReturnType<typeof gate.run> extends Promise<infer R> ? R : never;
// run is sync (kind:'static'); coerce for the proof
const red = redRes as { green: boolean; reds: Array<{ fact: string; locus?: string }>; unjudged?: boolean };

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
const greenR = gate.run(greenCtx) as { green: boolean; reds: unknown[]; unjudged?: boolean };

console.log(`\n[GREEN] green=${greenR.green} reds=${greenR.reds.length} unjudged=${greenR.unjudged ?? false}`);
check('GREEN: resolving call produces no red', greenR.green === true);
check('GREEN: it actually judged (not unjudged)', greenR.unjudged !== true);

/* ───────────────────────── UNJUDGED case ───────────────────────── */
// Changed file with no decidable consumer edge → honest unjudged, never green-by-default.
const unjRel = 'frontend/src/lib/__contract_edge_unjudged__.ts';
const unjText = `export const z = 1 + 2; // no apiFetch, no @OnEvent — nothing to assert\n`;
const unjOverlay = new Map<string, string>([[unjRel, unjText]]);
const unjCtx = makeContext(repoRoot, unjOverlay, [unjRel]);
const unjR = gate.run(unjCtx) as { green: boolean; reds: unknown[]; unjudged?: boolean };

console.log(`\n[UNJUDGED] green=${unjR.green} reds=${unjR.reds.length} unjudged=${unjR.unjudged ?? false}`);
check('UNJUDGED: returns unjudged when nothing decidable', unjR.unjudged === true);
check('UNJUDGED: emits zero reds', unjR.reds.length === 0);

/* ───────────────────────── NEW-edge-only guard ───────────────────────── */
// A real EXISTING file (has a disk prior) whose CURRENT content equals disk → its
// existing edges are NOT new → must not be reddened even if some legacy edge dangled.
// We assert: re-judging an unchanged on-disk consumer file yields no NEW-edge reds.
const realRel = 'frontend/src/lib/api/products.ts';
const realText = redCtx.readFile(realRel); // overlay-aware read = disk here
if (realText !== null) {
  const sameOverlay = new Map<string, string>([[realRel, realText]]);
  const sameCtx = makeContext(repoRoot, sameOverlay, [realRel]);
  const sameR = gate.run(sameCtx) as { reds: unknown[] };
  check('NEW-EDGE-ONLY: unchanged on-disk file introduces no new-edge red', sameR.reds.length === 0);
} else {
  check('NEW-EDGE-ONLY: products.ts present to test (skipped if absent)', true);
}

console.log(failures === 0 ? '\nPROOF PASS' : `\nPROOF FAIL (${failures} assertion(s) failed)`);
process.exit(failures === 0 ? 0 : 1);
