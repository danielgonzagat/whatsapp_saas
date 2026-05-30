/**
 * gates/property-gate.ts — the exoneration-free PROPERTY fact, at the
 * generated-input floor (the property-based-testing atom, dissolved).
 *
 * A unit test pins ONE input → ONE expected output. A PROPERTY pins an INVARIANT
 * that must hold for ALL inputs of a shape — and the only honest way to settle
 * "for all inputs" from a finite run is to SAMPLE the input space: generate K
 * inputs, run the function on each, and assert the invariant. The verdict is then
 * a single fact of exactly the right strength:
 *   - GREEN  — over K seeded-deterministic inputs, the invariant never broke.
 *   - RED    — a real counterexample exists (the SHRUNK, minimal input that
 *              breaks the invariant) → an exoneration-free fact: this concrete
 *              input, run through the real function, deterministically violates
 *              the asserted property. No heuristic, no guess.
 *   - UNJUDGED — no directive / no runner / the function can't be imported or run /
 *              the function is non-deterministic (so property testing is unsound).
 *
 * This is the DYNAMIC sibling of the static crivo and a generalisation of the
 * probe-convergence gate: where probe-convergence proves a FIXED execution reaches
 * a point, this proves an asserted invariant survives a STREAM of generated inputs
 * — the only fact bytes alone (and even a single fixed run) cannot settle.
 *
 * SELF-DRIVING SPEC (token-correct — read from a real `comment` AST node, never a
 * whole-file regex, so a directive-looking string LITERAL is NOT a directive):
 *
 *   // @property fn=<exportedName> invariant=<bool expr over `input` and `result`> \
 *               gen=<spec> [runs=<int>] [seed=<int>]
 *
 *  - `fn`        — the name the changed file must `export` (named export).
 *  - `invariant` — a JS boolean expression evaluated with two in-scope bindings:
 *                  `input` (the generated value, or array of values for a tuple)
 *                  and `result` (the function's return value). True = holds.
 *  - `gen`       — the generator spec (grammar below). Multiple comma-separated
 *                  specs ⇒ the function is called with the inputs SPREAD as args;
 *                  a single spec ⇒ called with one arg.
 *  - `runs`      — K, the number of generated samples (default 200, capped 5000).
 *  - `seed`      — PRNG seed (default 0xC0FFEE) so the verdict is REPRODUCIBLE.
 *
 * GEN GRAMMAR (the built-in generator; small but real):
 *   int            signed 32-bit
 *   int(min,max)   inclusive integer range
 *   nat            non-negative int
 *   bool           true|false
 *   string         arbitrary ASCII string (len 0..16)
 *   string(maxLen) ASCII string len 0..maxLen
 *   array(<spec>)  array (len 0..8) of the inner spec, e.g. array(int)
 *   float          finite double in [-1e6, 1e6]
 *
 * MUTATION FIREWALL: perception (web-tree-sitter, via astNodes) LOCATES the
 * directive in a real comment node; this gate then writes an EPHEMERAL driver as a
 * SIBLING file (it never mutates the target's bytes), runs it, and DELETES the
 * driver — snapshot → write-sibling → run-twice → revert (unlink) in a `finally`,
 * verified clean. The target file is read-only to this gate.
 *
 * PROBABILISTIC CEILING (brutal, documented honestly): K random samples can only
 * DISCONFIRM a universal — they cannot prove it. For a violation that occurs on a
 * fraction `p` of the input domain, the probability this gate catches it in K
 * independent samples is 1 - (1 - p)^K. A violation on a vanishingly rare set
 * (p ≪ 1/K) — an off-by-one at a single boundary, an overflow at one magic value —
 * can slip through GREEN. So GREEN here means "no counterexample found in K seeded
 * samples", NOT "the property is proven for all inputs". RED, by contrast, is
 * exact: a found counterexample is a real, reproducible failure. We push the
 * unenumerated-inputs horizon FAR (probabilistically), never to certainty. For
 * exhaustive certainty over a bounded domain, a formal gate is required — that is
 * a different, heavier atom.
 */
import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { astNodes } from '../native-bridge.js';
import { langOf } from './perception.js';
import {
  type GateModule,
  type GateContext,
  type GateResult,
  type GateRed,
} from './contract.js';

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const DEFAULT_RUNS = 200;
const MAX_RUNS = 5000;
const DEFAULT_SEED = 0xc0ffee;
const RUN_TIMEOUT_MS = 60000;

export interface PropertySpec {
  fn: string;
  invariant: string;
  /** raw gen spec text, comma-split into per-argument generator specs */
  gens: string[];
  runs: number;
  seed: number;
}

/**
 * Parse the @property directive out of the file's REAL comment nodes only.
 *
 * Token-correctness: we query the AST for `comment` nodes (`astNodes(...,{'comment'})`)
 * and only read the directive off a comment node's own text. A `// @property …`
 * string LITERAL is a `string` node, never a `comment` node, so it is invisible
 * here — the dominant false-positive a whole-file regex would produce is removed
 * by construction. Returns null when no grammar is available (→ caller unjudged),
 * when no comment carries the directive, or when the directive is malformed.
 */
export async function parsePropertyDirective(
  content: string,
  rel: string,
): Promise<PropertySpec | null | 'no-grammar'> {
  const lang = langOf(rel);
  const comments = await astNodes(content, lang, new Set(['comment']));
  if (comments === null) return 'no-grammar'; // honest defer — caller marks unjudged
  const directive = comments.map((c) => c.text).find((t) => t.includes('@property'));
  if (!directive) return null; // no property fact asserted in any real comment
  return parseDirectiveLine(directive);
}

/** Pure line→spec parse (exported for the proof). Returns null when malformed. */
export function parseDirectiveLine(line: string): PropertySpec | null {
  const fnM = /\bfn=([A-Za-z_$][\w$]*)/.exec(line);
  // invariant runs to the next ` gen=` / ` runs=` / ` seed=` key or end of line.
  const invM = /\binvariant=(.+?)(?=\s+(?:gen|runs|seed)=|$)/.exec(line);
  const genM = /\bgen=(.+?)(?=\s+(?:runs|seed)=|$)/.exec(line);
  const runsM = /\bruns=(\d+)/.exec(line);
  const seedM = /\bseed=(\d+)/.exec(line);
  if (!fnM || !invM || !genM) return null; // need fn + invariant + gen to be usable
  const gens = splitTopLevel(genM[1].trim());
  if (gens.length === 0) return null;
  const runs = runsM ? Math.min(MAX_RUNS, Math.max(1, Number(runsM[1]))) : DEFAULT_RUNS;
  const seed = seedM ? Number(seedM[1]) >>> 0 : DEFAULT_SEED;
  return { fn: fnM[1], invariant: invM[1].trim(), gens, runs, seed };
}

/**
 * Split a gen spec on top-level commas only — so `array(int), int` becomes
 * ['array(int)', 'int'] and the comma inside `int(0,10)` is NOT a split point.
 */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

const sha = (b: Buffer | string): string => crypto.createHash('sha256').update(b).digest('hex');

/** Choose the runner for the driver by target extension. tsx for TS, node for JS. */
function runnerFor(rel: string): { cmd: string; ext: string } | null {
  const ext = path.extname(rel).toLowerCase();
  if (ext === '.ts' || ext === '.tsx') return { cmd: 'npx tsx', ext };
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs' || ext === '.jsx') return { cmd: 'node', ext };
  return null;
}

/** Probe a runner is actually invocable (else honest unjudged, never assume green). */
function runnerAvailable(cmd: string, cwd: string): boolean {
  const probe = cmd.startsWith('npx tsx') ? 'npx tsx --version' : `${cmd.split(' ')[0]} --version`;
  const r = childProcess.spawnSync('/bin/bash', ['-c', probe], {
    cwd,
    encoding: 'utf8',
    timeout: 20000,
    env: process.env,
  });
  return (r.status ?? 1) === 0;
}

interface DriverObservation {
  /** the driver ran to a verdict (sentinel seen) */
  ran: boolean;
  /** a counterexample was found */
  cex: boolean;
  /** the shrunk counterexample input, JSON-encoded, when cex */
  shrunk?: string;
  /** the function result at the counterexample, JSON-encoded */
  result?: string;
  /** which engine produced the verdict: 'fast-check' (if resolvable) or 'builtin' */
  engine?: string;
  /** a fatal driver error (import failed / not a function / threw) — honest defer */
  error?: string;
}

const SENTINEL = '__PROPERTY_GATE__';

/**
 * Build the self-contained ephemeral driver. It:
 *  - imports the target's named export `fn`;
 *  - seeds a mulberry32 PRNG (so the SAME seed ⇒ the SAME K inputs ⇒ reproducible);
 *  - OPPORTUNISTICALLY uses fast-check if it resolves at runtime (richer shrinking),
 *    else falls back to the always-correct BUILT-IN generator + shrinker;
 *  - evaluates the author's invariant `(input,result) => <expr>`;
 *  - on the first failure, shrinks the input to a minimal still-failing witness;
 *  - prints exactly one SENTINEL line the gate parses, then exits.
 * The invariant is the author's own code in their own changed file — the same
 * trust boundary as probe-convergence's `run=` command.
 */
function buildDriver(spec: PropertySpec, targetModule: string): string {
  // targetModule is the relative import specifier from the driver to the target.
  const fnJson = JSON.stringify(spec.fn);
  const invJson = JSON.stringify(spec.invariant);
  const gensJson = JSON.stringify(spec.gens);
  return `/* ephemeral property-gate driver — auto-reverted */
import * as __M from ${JSON.stringify(targetModule)};
const __SENTINEL = ${JSON.stringify(SENTINEL)};
const __FN_NAME = ${fnJson};
const __INV = ${invJson};
const __GENS = ${gensJson};
const __RUNS = ${spec.runs};
const __SEED = ${spec.seed} >>> 0;
const __MULTI = __GENS.length > 1;

function emit(o) { console.log(__SENTINEL + ':' + JSON.stringify(o)); }

const fn = (__M && (__M[__FN_NAME] ?? (__M.default && __M.default[__FN_NAME])));
if (typeof fn !== 'function') {
  emit({ error: 'export ' + __FN_NAME + ' is not a function (got ' + typeof fn + ')' });
  process.exit(0);
}

// invariant evaluator over (input, result) — author's own expression.
let invFn;
try { invFn = new Function('input', 'result', 'return (' + __INV + ');'); }
catch (e) { emit({ error: 'invariant did not compile: ' + (e && e.message) }); process.exit(0); }

// ---- seeded PRNG (mulberry32) so K inputs are reproducible from the seed ----
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(__SEED);
const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));

// ---- built-in generator: spec string -> a random value ----
function genOne(specStr) {
  const s = specStr.trim();
  let m;
  if ((m = /^int\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/.exec(s))) return ri(parseInt(m[1], 10), parseInt(m[2], 10));
  if (s === 'int') return ri(-2147483648, 2147483647);
  if (s === 'nat') return ri(0, 2147483647);
  if (s === 'bool') return rng() < 0.5;
  if (s === 'float') return (rng() * 2 - 1) * 1e6;
  if ((m = /^string\(\s*(\d+)\s*\)$/.exec(s))) return randStr(parseInt(m[1], 10));
  if (s === 'string') return randStr(16);
  if ((m = /^array\((.+)\)$/.exec(s))) {
    const inner = m[1];
    const n = ri(0, 8);
    const a = [];
    for (let i = 0; i < n; i++) a.push(genOne(inner));
    return a;
  }
  // unknown spec -> a plain nat (never throw; the gate validated grammar shape too)
  return ri(0, 100);
}
function randStr(maxLen) {
  const n = ri(0, maxLen);
  let out = '';
  for (let i = 0; i < n; i++) out += String.fromCharCode(ri(32, 126));
  return out;
}

// ---- shrinker: smaller candidates toward an empty/zero witness ----
function shrinkOne(specStr, v) {
  if (typeof v === 'number') {
    const c = [];
    if (v !== 0) c.push(0);
    if (Math.abs(v) > 1) c.push(Math.trunc(v / 2));
    if (v > 0) c.push(v - 1); else if (v < 0) c.push(v + 1);
    return c;
  }
  if (typeof v === 'boolean') return v ? [false] : [];
  if (typeof v === 'string') {
    const c = [];
    if (v.length > 0) { c.push(''); c.push(v.slice(0, Math.floor(v.length / 2))); c.push(v.slice(1)); }
    return c;
  }
  if (Array.isArray(v)) {
    const inner = (/^array\((.+)\)$/.exec(specStr.trim()) || [, 'int'])[1];
    const c = [];
    if (v.length > 0) {
      c.push([]);
      c.push(v.slice(0, Math.floor(v.length / 2)));
      c.push(v.slice(1));
      // shrink each element once
      for (let i = 0; i < v.length; i++) {
        for (const sv of shrinkOne(inner, v[i])) { const cp = v.slice(); cp[i] = sv; c.push(cp); }
      }
    }
    return c;
  }
  return [];
}

function callFn(input) {
  return __MULTI ? fn.apply(null, input) : fn(input);
}
function holds(input) {
  let result;
  try { result = callFn(input); } catch (e) { return { ok: false, threw: true, result: 'threw: ' + (e && e.message) }; }
  let ok;
  try { ok = !!invFn(input, result); } catch (e) { return { ok: false, threw: true, result: 'invariant-threw: ' + (e && e.message) }; }
  return { ok, threw: false, result };
}

// shrink a failing input to a minimal still-failing witness
function shrink(input) {
  let best = input;
  let bestRes = holds(best);
  let improved = true;
  let budget = 1000;
  while (improved && budget-- > 0) {
    improved = false;
    const specs = __MULTI ? __GENS : [__GENS[0]];
    const cands = [];
    if (__MULTI) {
      for (let i = 0; i < best.length; i++) {
        for (const sv of shrinkOne(specs[i], best[i])) { const cp = best.slice(); cp[i] = sv; cands.push(cp); }
      }
    } else {
      for (const sv of shrinkOne(specs[0], best)) cands.push(sv);
    }
    for (const cand of cands) {
      const r = holds(cand);
      if (!r.ok) { best = cand; bestRes = r; improved = true; break; }
    }
  }
  return { input: best, res: bestRes };
}

async function runBuiltin() {
  for (let i = 0; i < __RUNS; i++) {
    const input = __MULTI ? __GENS.map(genOne) : genOne(__GENS[0]);
    const r = holds(input);
    if (!r.ok) {
      const sh = shrink(input);
      emit({ cex: true, shrunk: sh.input, result: safe(sh.res.result), engine: 'builtin' });
      return;
    }
  }
  emit({ cex: false, engine: 'builtin' });
}

function safe(v) { try { return JSON.parse(JSON.stringify(v)); } catch { return String(v); } }

async function main() {
  // OPPORTUNISTIC fast-check: richer integrated shrinking WHERE resolvable.
  try {
    const fc = await import('fast-check');
    const arbFor = (s) => {
      const t = s.trim(); let m;
      if ((m = /^int\(\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/.exec(t))) return fc.integer({ min: +m[1], max: +m[2] });
      if (t === 'int') return fc.integer();
      if (t === 'nat') return fc.nat();
      if (t === 'bool') return fc.boolean();
      if (t === 'float') return fc.double({ min: -1e6, max: 1e6, noNaN: true });
      if ((m = /^string\(\s*(\d+)\s*\)$/.exec(t))) return fc.string({ maxLength: +m[1] });
      if (t === 'string') return fc.string({ maxLength: 16 });
      if ((m = /^array\((.+)\)$/.exec(t))) return fc.array(arbFor(m[1]), { maxLength: 8 });
      return fc.nat();
    };
    const arbs = __GENS.map(arbFor);
    const prop = fc.property(...arbs, (...args) => {
      const input = __MULTI ? args : args[0];
      const r = holds(input);
      return r.ok;
    });
    const out = fc.check(prop, { numRuns: __RUNS, seed: __SEED });
    if (out.failed) {
      const ce = out.counterexample;
      const input = __MULTI ? ce : ce[0];
      const r = holds(input);
      emit({ cex: true, shrunk: safe(input), result: safe(r.result), engine: 'fast-check' });
    } else {
      emit({ cex: false, engine: 'fast-check' });
    }
    return;
  } catch (e) {
    // fast-check not resolvable (the common case here) -> built-in path.
  }
  await runBuiltin();
}

main().catch((e) => { emit({ error: 'driver threw: ' + (e && e.message) }); process.exit(0); });
`;
}

/** Parse the single SENTINEL line off the driver's stdout/stderr. */
function parseObservation(out: string): DriverObservation {
  const re = new RegExp(`${SENTINEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(.*)`, 'm');
  const m = re.exec(out);
  if (!m) return { ran: false, cex: false };
  try {
    const o = JSON.parse(m[1].trim()) as Partial<DriverObservation>;
    if (o.error) return { ran: false, cex: false, error: o.error };
    return {
      ran: true,
      cex: !!o.cex,
      shrunk: o.shrunk !== undefined ? JSON.stringify(o.shrunk) : undefined,
      result: o.result !== undefined ? JSON.stringify(o.result) : undefined,
      engine: o.engine,
    };
  } catch {
    return { ran: false, cex: false, error: 'unparseable driver output' };
  }
}

/**
 * Execute ONE property under the snapshot → write-sibling-driver → run-twice →
 * revert (unlink driver) transaction. The TARGET file's bytes are never touched.
 * Determinism: the driver is seeded, so the two runs MUST agree; a disagreement
 * means the FUNCTION UNDER TEST is non-deterministic (clock/random/IO) and property
 * testing over it is unsound → UNJUDGED (the honest ceiling), never red/green-by-guess.
 */
function executeProperty(
  ctx: GateContext,
  rel: string,
  spec: PropertySpec,
): { red?: GateRed; unjudged?: string } {
  const runner = runnerFor(rel);
  if (!runner) return { unjudged: `no runner for '${path.extname(rel)}' — cannot execute the property` };
  if (!runnerAvailable(runner.cmd, ctx.repoRoot)) {
    return { unjudged: `runner '${runner.cmd}' is not invocable — honest defer (no green-by-assumption)` };
  }

  // The driver is a SIBLING of the target so its relative import resolves cleanly.
  const targetAbs = path.join(ctx.repoRoot, rel);
  if (!fs.existsSync(targetAbs) && ctx.readFile(rel) === null) {
    return { unjudged: `cannot read target '${rel}'` };
  }
  const dir = path.dirname(targetAbs);
  const base = path.basename(rel).replace(/\.(tsx?|jsx?|mjs|cjs)$/, '');
  // driver extension mirrors the target so the runner + ESM resolution match.
  const driverExt = runner.ext === '.tsx' ? '.tsx' : runner.ext === '.jsx' ? '.jsx' : runner.ext;
  const driverName = `.__propgate_${base}_${crypto.randomBytes(4).toString('hex')}${driverExt}`;
  const driverAbs = path.join(dir, driverName);
  // import specifier from driver → target: same dir, drop the extension for TS/ESM.
  const targetSpec = `./${path.basename(rel)}`;
  const driverSrc = buildDriver(spec, targetSpec);

  const existedBefore = fs.existsSync(driverAbs); // should never pre-exist (random name)
  const targetShaBefore = sha(fs.readFileSync(targetAbs));
  const cmd = `${runner.cmd} ${JSON.stringify(driverAbs)}`;

  let obs: DriverObservation[] = [];
  try {
    fs.writeFileSync(driverAbs, driverSrc);
    obs = [runDriver(cmd, ctx.repoRoot), runDriver(cmd, ctx.repoRoot)];
  } catch (e) {
    return { unjudged: `property harness threw: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    // revert: remove the ephemeral driver — ALWAYS, even on throw/timeout.
    try {
      if (!existedBefore && fs.existsSync(driverAbs)) fs.unlinkSync(driverAbs);
    } catch {
      /* best-effort; the sha check below catches a dirty tree */
    }
  }

  // The gate must NOT mutate the target. Verify byte-identity (it never wrote it).
  const targetShaAfter = sha(fs.readFileSync(targetAbs));
  if (targetShaAfter !== targetShaBefore) {
    return { unjudged: `target '${rel}' changed under the harness — refusing to judge on a dirty tree` };
  }
  if (fs.existsSync(driverAbs)) {
    return { unjudged: `ephemeral driver not removed for '${rel}' — refusing to judge on a dirty tree` };
  }

  const [a, b] = obs;
  if (a.error || b.error) {
    return { unjudged: `cannot execute property for '${rel}': ${a.error ?? b.error}` };
  }
  if (!a.ran || !b.ran) {
    return { unjudged: `property driver produced no verdict for '${rel}' (no sentinel) — honest defer` };
  }
  // determinism: a seeded run MUST be reproducible. Disagreement ⇒ the function
  // under test is non-deterministic ⇒ property testing is unsound ⇒ UNJUDGED.
  if (a.cex !== b.cex || a.shrunk !== b.shrunk || a.result !== b.result) {
    // Two failure modes of non-determinism are both caught here:
    //  - the VERDICT disagrees (one run finds a cex, the other doesn't, or a
    //    different shrunk input), OR
    //  - the verdict agrees but the RESULT at the same input differs across runs
    //    (e.g. the function returns Date.now()/random — same input, different
    //    output). Either way the function is not a single-valued map, so the
    //    "for all inputs the invariant holds" question is ill-posed → UNJUDGED.
    const r1 = a.cex ? `cex:${a.shrunk}=>${a.result}` : `no-cex(result=${a.result ?? 'n/a'})`;
    const r2 = b.cex ? `cex:${b.shrunk}=>${b.result}` : `no-cex(result=${b.result ?? 'n/a'})`;
    return {
      unjudged:
        `non-deterministic function '${spec.fn}' in '${rel}' ` +
        `(run1=${r1} vs run2=${r2}) ` +
        `— property testing is unsound over a non-deterministic function`,
    };
  }

  if (a.cex) {
    return {
      red: {
        file: rel,
        locus: spec.fn,
        fact:
          `property of '${spec.fn}' FAILS: invariant \`${spec.invariant}\` is FALSE for the shrunk input ` +
          `${a.shrunk} (result=${a.result ?? 'n/a'}) — a real counterexample found by the ${a.engine} engine ` +
          `over ${spec.runs} seeded runs`,
      },
    };
  }
  return {}; // GREEN: no counterexample in K seeded samples (probabilistic, not proof)
}

/** Run the driver once and return the parsed observation. */
function runDriver(cmd: string, cwd: string): DriverObservation {
  const res = childProcess.spawnSync('/bin/bash', ['-c', cmd], {
    cwd,
    encoding: 'utf8',
    timeout: RUN_TIMEOUT_MS,
    maxBuffer: 16 * 1024 * 1024,
    env: process.env,
  });
  return parseObservation(`${res.stdout ?? ''}\n${res.stderr ?? ''}`);
}

const propertyGate: GateModule = {
  name: 'property',
  kind: 'dynamic',
  appliesTo: (rel) => SOURCE_RE.test(rel),

  async run(ctx: GateContext): Promise<GateResult> {
    const note =
      'every @property directive: the asserted invariant holds over K seeded generated inputs ' +
      '(green = no counterexample found; probabilistic, NOT exhaustive) — a found counterexample is a real RED';

    const targets = ctx.changedFiles.length > 0 ? ctx.changedFiles : [];
    const reds: GateRed[] = [];
    const deferrals: string[] = [];
    let propCount = 0;

    for (const raw of targets) {
      const rel = raw.replaceAll('\\', '/');
      if (!SOURCE_RE.test(rel)) continue;
      const content = ctx.readFile(rel);
      if (content === null) continue;
      const parsed = await parsePropertyDirective(content, rel);
      if (parsed === 'no-grammar') {
        // a file we cannot parse → cannot assert token-correctness → honest defer.
        if (content.includes('@property')) deferrals.push(`${rel}: no grammar to read comment nodes`);
        continue;
      }
      if (parsed === null) continue; // no usable property fact in a real comment
      propCount += 1;
      const verdict = executeProperty(ctx, rel, parsed);
      if (verdict.red) reds.push(verdict.red);
      else if (verdict.unjudged) deferrals.push(`${rel}: ${verdict.unjudged}`);
    }

    if (propCount === 0 && deferrals.length === 0) {
      return { gate: this.name, green: true, reds: [], note };
    }
    if (reds.length === 0 && propCount > 0 && deferrals.length === propCount) {
      // EVERY property was undecidable (no runner / non-determinism / import failure).
      return {
        gate: this.name,
        green: true,
        reds: [],
        note: `${note} — ALL ${propCount} property(ies) UNJUDGED: ${deferrals.slice(0, 4).join(' | ')}`,
        unjudged: true,
      };
    }
    if (reds.length === 0 && propCount === 0 && deferrals.length > 0) {
      // only no-grammar deferrals → unjudged, not a fake green.
      return {
        gate: this.name,
        green: true,
        reds: [],
        note: `${note} — UNJUDGED: ${deferrals.slice(0, 4).join(' | ')}`,
        unjudged: true,
      };
    }
    return {
      gate: this.name,
      green: reds.length === 0,
      reds,
      note:
        deferrals.length > 0
          ? `${note} (${deferrals.length} property(ies) unjudged: ${deferrals.slice(0, 2).join(' | ')})`
          : note,
    };
  },
};

export default propertyGate;
