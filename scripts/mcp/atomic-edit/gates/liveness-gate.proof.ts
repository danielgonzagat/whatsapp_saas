/**
 * liveness-gate.proof.ts — standalone tsx proof of the LIVENESS fact (the breathing
 * horizon, pushed). Run:
 *
 *   npx tsx scripts/mcp/atomic-edit/gates/liveness-gate.proof.ts
 *
 * Self-builds via tsx (no shared dist). It drives the gate through ALL THREE honest
 * outcomes using an INJECTED live oracle (so the proof is deterministic and offline),
 * AND it exercises the REAL network/env path twice — once to prove a genuinely
 * unreachable instance degrades to UNJUDGED (the honesty core), and once to confirm
 * env-resolution behaviour — so the live grounding is not faked.
 *
 *   RED      — a NEW apiFetch('/products/__phantom_live__') whose live probe returns
 *              404 (route NOT mounted in the running instance) → a DANGLING LIVE WIRE.
 *              Plus a 5xx probe on another path → mounted-but-broken, also RED.
 *   GREEN    — a NEW apiFetch('/products/stats') whose live probe returns 200 (and a
 *              second whose probe returns 401 — auth-gated but SERVED) → the wire is
 *              live → no red, and the gate actually decided (not unjudged).
 *   UNJUDGED — (a) no live target reachable: baseUrl=null → the gate asserts nothing
 *              about HTTP wires (never green-by-assumption). (b) base URL present but
 *              the live oracle returns 'unreachable' for every path (DNS/timeout) →
 *              still unjudged. (c) the REAL fetchProbe against a guaranteed-dead host
 *              returns 'unreachable' → classifyLive → unjudged: proven against the
 *              real network stack, not a mock.
 *   SPAN     — observed-span half: an EMPTY observed set (Sentry node total_events:0,
 *              grounded live this session) → a declared span is UNJUDGED, never green.
 *              A NON-EMPTY observed set lacking the declared span → RED (dead telemetry
 *              wire confirmed live). A NON-EMPTY set containing it → GREEN.
 *   FP       — the consumed path / span tokens live ONLY inside a comment and a
 *              template literal → read through perception (real call_expression nodes)
 *              they are comment/template_string nodes, never extracted → ZERO probes,
 *              ZERO reds, UNJUDGED. The whole-file-regex FP is gone.
 *
 * Each planted file is BRAND-NEW (no disk prior) so every wire is a NEW wire under the
 * gate's NEW-edge-only delta semantics.
 *
 * GROUNDING (real MCP reads performed this session, encoded as the proof's premises):
 *  - Railway environment_status → "Unauthorized. Please run railway login" : the live
 *    HTTP surface is NOT reachable → the real-network UNJUDGED case mirrors this.
 *  - Sentry sentry_project_stats(node, 24h) → total_events:0 : the live observed-span
 *    set is EMPTY → the SPAN-UNJUDGED case mirrors this exactly.
 *  - postgres pg_status → configured localhost (a local target, not the prod surface).
 */
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeContext } from './contract.js';
import gate, {
  __setLivenessProbeConfig,
  classifyLive,
  fetchProbe,
  resolveLiveBaseUrl,
  type LiveProbe,
} from './liveness-gate.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(HERE, '..', '..', '..', '..'); // gates → atomic-edit → mcp → scripts → repo

let failures = 0;
const check = (label: string, cond: boolean): void => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} — ${label}`);
  if (!cond) failures++;
};

/** Build a deterministic live oracle from a path→status table. */
function tableProbe(table: Record<string, number | 'unreachable'>): LiveProbe {
  return async (_method, url) => {
    for (const [p, status] of Object.entries(table)) {
      if (url.endsWith(p)) return status;
    }
    return 'unreachable';
  };
}

async function runOn(rel: string, text: string): Promise<ReturnType<typeof gate.run>> {
  const overlay = new Map<string, string>([[rel, text]]);
  const ctx = makeContext(repoRoot, overlay, [rel]);
  return gate.run(ctx);
}

async function main(): Promise<void> {
  const BASE = 'https://live.example.test';

  /* ───────────────────────── classifyLive unit facts ───────────────────────── */
  check('classify 200 → served', classifyLive(200) === 'served');
  check('classify 302 → served', classifyLive(302) === 'served');
  check('classify 401 → served (auth-gated but routed)', classifyLive(401) === 'served');
  check('classify 405 → served (wrong verb but mounted)', classifyLive(405) === 'served');
  check('classify 404 → dangling (not mounted live)', classifyLive(404) === 'dangling');
  check('classify 500 → dangling (mounted but broken)', classifyLive(500) === 'dangling');
  check('classify 503 → dangling', classifyLive(503) === 'dangling');
  check('classify unreachable → unjudged', classifyLive('unreachable') === 'unjudged');

  /* ───────────────────────── RED case ───────────────────────── */
  // A live instance is reachable; one NEW path 404s (not mounted), another 5xx (broken).
  __setLivenessProbeConfig({
    baseUrl: BASE,
    probe: tableProbe({ '/products/__phantom_live__': 404, '/products/__broken_live__': 500 }),
  });
  const redRel = 'frontend/src/lib/api/__liveness_red__.ts';
  const redText = `
import { apiFetch } from './core';
export const x = {
  phantom: () => apiFetch<unknown>('/products/__phantom_live__'),
  broken:  () => apiFetch<unknown>('/products/__broken_live__'),
};
`;
  const red = await runOn(redRel, redText);
  console.log('\n[RED] reds:');
  for (const r of red.reds) console.log(`   - ${r.locus ?? ''}  ::  ${r.fact}`);
  check('RED: gate is not green', red.green === false);
  check('RED: it decided (not unjudged)', red.unjudged !== true);
  check(
    'RED: caught the 404 dangling-live wire',
    red.reds.some((r) => r.fact.includes('NOT mounted (404)') && r.locus?.includes('__phantom_live__')),
  );
  check(
    'RED: caught the 5xx not-serving wire',
    red.reds.some((r) => r.fact.includes('does not serve (HTTP 500)') && r.locus?.includes('__broken_live__')),
  );

  /* ───────────────────────── GREEN case ───────────────────────── */
  // Both NEW paths SERVE live: one 200, one 401 (auth-gated but routed = served).
  __setLivenessProbeConfig({
    baseUrl: BASE,
    probe: tableProbe({ '/products/stats': 200, '/wallet/balance': 401 }),
  });
  const greenRel = 'frontend/src/lib/api/__liveness_green__.ts';
  const greenText = `
import { apiFetch } from './core';
export const y = {
  stats:   () => apiFetch<Record<string, unknown>>('/products/stats'),
  balance: () => apiFetch<unknown>('/wallet/balance'),
};
`;
  const greenR = await runOn(greenRel, greenText);
  console.log(`\n[GREEN] green=${greenR.green} reds=${greenR.reds.length} unjudged=${greenR.unjudged ?? false}`);
  check('GREEN: serving wires produce no red', greenR.green === true);
  check('GREEN: it actually judged (a live response came back)', greenR.unjudged !== true);

  /* ───────────────── UNJUDGED (a) — no live target reachable ───────────────── */
  // baseUrl=null → the live surface is absent → the gate asserts NOTHING (never
  // green-by-assumption that the wire serves). This is the honesty core.
  __setLivenessProbeConfig({ baseUrl: null });
  const unjA = await runOn('frontend/src/lib/api/__liveness_noTarget__.ts', greenText);
  console.log(`\n[UNJUDGED-a:no-target] unjudged=${unjA.unjudged ?? false} reds=${unjA.reds.length}`);
  check('UNJUDGED-a: no base URL → unjudged', unjA.unjudged === true);
  check('UNJUDGED-a: zero reds (asserts nothing)', unjA.reds.length === 0);

  /* ───────────────── UNJUDGED (b) — reachable URL but every probe unreachable ─────────────── */
  // base URL present but the instance answers nothing (DNS/timeout) → 'unreachable'
  // for every path → still unjudged. Mirrors Railway "Unauthorized" this session.
  __setLivenessProbeConfig({ baseUrl: BASE, probe: async () => 'unreachable' });
  const unjB = await runOn('frontend/src/lib/api/__liveness_unreach__.ts', greenText);
  console.log(`\n[UNJUDGED-b:unreachable] unjudged=${unjB.unjudged ?? false} reds=${unjB.reds.length}`);
  check('UNJUDGED-b: all-unreachable → unjudged', unjB.unjudged === true);
  check('UNJUDGED-b: zero reds (no live evidence → no verdict)', unjB.reds.length === 0);

  /* ───────────────── UNJUDGED (c) — the REAL fetchProbe vs a dead host ─────────────── */
  // Not a mock: call the real network oracle against a guaranteed-unreachable host and
  // assert it degrades to 'unreachable' → classifyLive → unjudged. This proves the
  // default network path returns unjudged (NOT a false green) when nothing is up — the
  // exact behaviour Railway's "Unauthorized" forces in the live environment.
  const deadStatus = await fetchProbe('GET', 'http://127.0.0.1:1/__definitely_no_server__');
  console.log(`\n[UNJUDGED-c:real-fetch] fetchProbe(dead host) = ${String(deadStatus)}`);
  check('UNJUDGED-c: real fetchProbe → unreachable on dead host', deadStatus === 'unreachable');
  check('UNJUDGED-c: classifyLive(real-unreachable) → unjudged', classifyLive(deadStatus) === 'unjudged');

  /* ───────────────── SPAN half — empty observed set = unjudged (grounded) ─────────────── */
  // Sentry node total_events:0 (read live this session) → observed set is EMPTY → a
  // declared span is UNJUDGED, never green-by-assumption.
  __setLivenessProbeConfig({ baseUrl: null, observedSpanNames: new Set<string>() });
  const spanText = `
const tracer = makeTracer();
export function work() {
  const span = tracer.startSpan('kloel.live.phantom_span');
  return span;
}
`;
  const spanEmpty = await runOn('backend/src/__liveness_span_empty__.ts', spanText);
  console.log(`\n[SPAN:empty-observed] unjudged=${spanEmpty.unjudged ?? false} reds=${spanEmpty.reds.length}`);
  check('SPAN: empty observed set → unjudged (Sentry total_events:0 grounded)', spanEmpty.unjudged === true);
  check('SPAN: empty observed set → zero reds (never green/red-by-assumption)', spanEmpty.reds.length === 0);

  /* ───────────────── SPAN half — non-empty set lacking the span = RED ─────────────── */
  __setLivenessProbeConfig({
    baseUrl: null,
    observedSpanNames: new Set<string>(['http.server.request', 'db.query']),
  });
  const spanRed = await runOn('backend/src/__liveness_span_red__.ts', spanText);
  console.log(`\n[SPAN:non-empty-missing] green=${spanRed.green} reds=${spanRed.reds.length}`);
  check('SPAN: non-empty observed set missing the span → red', spanRed.green === false);
  check(
    'SPAN: red names the dead-live telemetry wire',
    spanRed.reds.some((r) => r.fact.includes('NOT in the live observed set') && r.locus?.includes('phantom_span')),
  );

  /* ───────────────── SPAN half — non-empty set containing the span = GREEN ─────────────── */
  __setLivenessProbeConfig({
    baseUrl: null,
    observedSpanNames: new Set<string>(['kloel.live.phantom_span']),
  });
  const spanGreen = await runOn('backend/src/__liveness_span_green__.ts', spanText);
  console.log(`\n[SPAN:observed] green=${spanGreen.green} reds=${spanGreen.reds.length} unjudged=${spanGreen.unjudged ?? false}`);
  check('SPAN: observed span → green', spanGreen.green === true && spanGreen.unjudged !== true);

  /* ───────────────── FP — comment/template tokens are NOT probed ─────────────── */
  // The ONLY apiFetch('/products/…') and startSpan('…') tokens live inside a comment
  // and a template literal. Under perception they are comment/template_string nodes,
  // never call_expression → ZERO probes, ZERO reds, UNJUDGED. A whole-file regex would
  // have fired a live probe on the comment path (a real FP — it would hit the network).
  let probeCount = 0;
  __setLivenessProbeConfig({
    baseUrl: BASE,
    probe: async (_m, _u) => {
      probeCount += 1;
      return 404; // if perception leaked, this would manufacture a RED
    },
    observedSpanNames: new Set<string>(['something']),
  });
  const fpRel = 'frontend/src/lib/api/__liveness_fp__.ts';
  const fpText = [
    "// docs: call apiFetch('/products/in/comment') and tracer.startSpan('span.in.comment')",
    'export const codegen = () => {',
    '  const generated = `',
    "    apiFetch('/products/in/template/__should_not_probe__')",
    "    tracer.startSpan('span.in.template')",
    '  `;',
    '  return generated.length;',
    '};',
    '',
  ].join('\n');
  const fpR = await runOn(fpRel, fpText);
  console.log(`\n[FP] probesFired=${probeCount} reds=${fpR.reds.length} unjudged=${fpR.unjudged ?? false}`);
  for (const r of fpR.reds) console.log(`   - LEAKED ${r.locus ?? ''}  ::  ${r.fact}`);
  check('FP: ZERO live probes fired on comment/template tokens', probeCount === 0);
  check('FP: zero reds (no comment/template token extracted)', fpR.reds.length === 0);
  check('FP: unjudged (nothing real to probe — the FP is gone)', fpR.unjudged === true);

  /* ───────────────── env resolution sanity ─────────────── */
  const noBase = resolveLiveBaseUrl({} as NodeJS.ProcessEnv);
  check('ENV: empty env → null base (→ gate unjudged)', noBase === null);
  const withBase = resolveLiveBaseUrl({ LIVENESS_BASE_URL: 'https://x.test/' } as NodeJS.ProcessEnv);
  check('ENV: LIVENESS_BASE_URL resolved + trailing slash trimmed', withBase === 'https://x.test');
  const pulseBase = resolveLiveBaseUrl({ PULSE_BACKEND_URL: 'https://kloel.test' } as NodeJS.ProcessEnv);
  check('ENV: PULSE_BACKEND_URL is a recognized live target key', pulseBase === 'https://kloel.test');

  __setLivenessProbeConfig(null); // reset to live defaults
  console.log(failures === 0 ? '\nPROOF PASS' : `\nPROOF FAIL (${failures} assertion(s) failed)`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
