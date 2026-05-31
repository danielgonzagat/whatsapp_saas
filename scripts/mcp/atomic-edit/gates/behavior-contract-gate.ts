/**
 * gates/behavior-contract-gate.ts — the exoneration-free BEHAVIORAL-REGRESSION fact,
 * a DYNAMIC gate (the characterization/intent atom, dissolved and INVERTED).
 *
 * Characterization testing (Feathers) captures a function's observed behavior so a
 * later change that alters it is caught — but it is MANUAL, ADVISORY, and lives in CI.
 * This gate inverts and lowers it: the "contract" is the function's OWN PRIOR observed
 * outputs (ctx.priorOf — the bytes before this write), re-observed against the NEW bytes
 * over K seeded inputs. The verdict is one fact of exactly the right strength:
 *   - GREEN            — over K seeded-deterministic inputs prior(fn) and new(fn) AGREE:
 *                        this write PRESERVES the observed behavioral contract.
 *   - RED              — a concrete input exists where new(fn) ≠ prior(fn) AND the write
 *                        does NOT carry a co-committed `@behavior-change-approved fn=<same>`
 *                        directive: a SILENT behavioral divergence. Exoneration-free —
 *                        this input, run through both real versions, deterministically
 *                        differs. No heuristic, no guess.
 *   - GREEN (approved) — a divergence exists but the write co-commits the intent update
 *                        `@behavior-change-approved`: the change was MEANT; intent and
 *                        implementation move together. This is the novel shape — behavior
 *                        may change ONLY WITH a co-committed intent update.
 *   - UNJUDGED         — no directive / no prior export (a NEW fn cannot regress) / no
 *                        runner / the function is non-deterministic (so the comparison is
 *                        ill-posed) — never red-by-guess, never green-by-assumption.
 *
 * Where the property gate proves an ASSERTED invariant survives generated inputs, this
 * proves the function's OWN PAST BEHAVIOR survives the edit — the fact that separates
 * "well-formed" from "still does what it did". Proposer (the author's directive selects
 * fn+gen) ≠ judge (a separate process runs the REAL bytes of BOTH versions and compares).
 * The target's bytes are never mutated: prior and new are materialized as EPHEMERAL
 * SIBLINGS, run, and reverted — snapshot → write-siblings → run-twice → revert (unlink).
 *
 * PROBABILISTIC CEILING (honest): K seeded samples can only DISCONFIRM behavioral
 * identity — a divergence on a vanishingly rare input can slip GREEN. GREEN means "no
 * divergence in K seeded samples", never "behaviorally identical for all inputs". RED is
 * exact. The contract is only as wide as the SAMPLED input domain; behavior on un-sampled
 * inputs is the declared horizon, not a proof.
 *
 * SELF-DRIVING SPEC (token-correct — read from a real `comment` AST node only, never a
 * whole-file regex, so a directive-looking string LITERAL is NOT a directive):
 *   // @behavior-contract fn=<exportedName> gen=<spec> [runs=<int>] [seed=<int>]
 *   // @behavior-change-approved fn=<exportedName>     ← co-committed intent update
 * gen grammar = the property gate's: int | int(min,max) | nat | bool | string |
 *   string(maxLen) | float | array(<spec>). Multiple comma-separated specs ⇒ args spread.
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
const SENTINEL = '__BEHAVIOR_CONTRACT_GATE__';

export interface BehaviorSpec {
  fn: string;
  gens: string[];
  runs: number;
  seed: number;
  /** true when a co-committed `@behavior-change-approved fn=<fn>` directive is present */
  approved: boolean;
}

/**
 * Parse the @behavior-contract directive (and any matching @behavior-change-approved)
 * out of the file's REAL comment nodes only. A directive-looking string LITERAL is a
 * `string` node, never a `comment` node, so it is invisible here by construction.
 */
export async function parseBehaviorDirective(
  content: string,
  rel: string,
): Promise<BehaviorSpec | null | 'no-grammar'> {
  const lang = langOf(rel);
  const comments = await astNodes(content, lang, new Set(['comment']));
  if (comments === null) return 'no-grammar'; // honest defer — caller marks unjudged
  const texts = comments.map((c) => c.text);
  const directive = texts.find((t) => t.includes('@behavior-contract'));
  if (!directive) return null; // no behavioral fact asserted in any real comment
  const spec = parseDirectiveLine(directive);
  if (!spec) return null;
  // an approval is only valid for the SAME fn, read from a real comment node too.
  spec.approved = texts.some((t) => {
    if (!t.includes('@behavior-change-approved')) return false;
    const m = /@behavior-change-approved\b[^\n]*?\bfn=([A-Za-z_$][\w$]*)/.exec(t);
    return !!m && m[1] === spec.fn;
  });
  return spec;
}

/** Pure line→spec parse (exported for the proof). Returns null when malformed. */
export function parseDirectiveLine(line: string): BehaviorSpec | null {
  const fnM = /@behavior-contract\b[^\n]*?\bfn=([A-Za-z_$][\w$]*)/.exec(line);
  const genM = /\bgen=(.+?)(?=\s+(?:runs|seed)=|$)/.exec(line);
  const runsM = /\bruns=(\d+)/.exec(line);
  const seedM = /\bseed=(\d+)/.exec(line);
  if (!fnM || !genM) return null; // need fn + gen to sample the behavior
  const gens = splitTopLevel(genM[1].trim());
  if (gens.length === 0) return null;
  const runs = runsM ? Math.min(MAX_RUNS, Math.max(1, Number(runsM[1]))) : DEFAULT_RUNS;
  const seed = seedM ? Number(seedM[1]) >>> 0 : DEFAULT_SEED;
  return { fn: fnM[1], gens, runs, seed, approved: false };
}

/** Split a gen spec on TOP-LEVEL commas only, so `int(0,10)`'s comma is not a split. */
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

/** Choose the runner by target extension. tsx for TS, node for JS — else honest defer. */
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
  ran: boolean;
  /** prior(fn) and new(fn) diverged on some input */
  diverged: boolean;
  /** the divergent input, JSON-encoded, when diverged */
  input?: string;
  /** prior(fn)(input), JSON-encoded */
  priorResult?: string;
  /** new(fn)(input), JSON-encoded */
  newResult?: string;
  /** a fatal driver error (import failed / not a function / threw) — honest defer */
  error?: string;
  /** prior had no such export (a NEW fn cannot regress) — honest defer */
  noPrior?: boolean;
}

/**
 * Build the self-contained ephemeral driver. It imports `fn` from BOTH the prior and
 * the new sibling, seeds a mulberry32 PRNG (so the SAME seed ⇒ the SAME K inputs), runs
 * both versions on each input, and emits the FIRST divergence (or none). The author's
 * gen spec is the same trust boundary as the property gate's directive.
 */
function buildDriver(spec: BehaviorSpec, priorModule: string, newModule: string): string {
  const fnJson = JSON.stringify(spec.fn);
  const gensJson = JSON.stringify(spec.gens);
  return `/* ephemeral behavior-contract-gate driver — auto-reverted */
import * as __PRIOR from ${JSON.stringify(priorModule)};
import * as __NEW from ${JSON.stringify(newModule)};
const __SENTINEL = ${JSON.stringify(SENTINEL)};
const __FN = ${fnJson};
const __GENS = ${gensJson};
const __RUNS = ${spec.runs};
const __SEED = ${spec.seed} >>> 0;
const __MULTI = __GENS.length > 1;

function emit(o) { console.log(__SENTINEL + ':' + JSON.stringify(o)); }
function pick(M) { return M && (M[__FN] ?? (M.default && M.default[__FN])); }

const priorFn = pick(__PRIOR);
const newFn = pick(__NEW);
if (typeof newFn !== 'function') { emit({ error: 'new export ' + __FN + ' is not a function (got ' + typeof newFn + ')' }); process.exit(0); }
if (typeof priorFn !== 'function') { emit({ noPrior: true }); process.exit(0); }

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
function randStr(maxLen) { const n = ri(0, maxLen); let o = ''; for (let i = 0; i < n; i++) o += String.fromCharCode(ri(32, 126)); return o; }
function genOne(specStr) {
  const s = specStr.trim(); let m;
  if ((m = /^int\\(\\s*(-?\\d+)\\s*,\\s*(-?\\d+)\\s*\\)$/.exec(s))) return ri(parseInt(m[1],10), parseInt(m[2],10));
  if (s === 'int') return ri(-2147483648, 2147483647);
  if (s === 'nat') return ri(0, 2147483647);
  if (s === 'bool') return rng() < 0.5;
  if (s === 'float') return (rng() * 2 - 1) * 1e6;
  if ((m = /^string\\(\\s*(\\d+)\\s*\\)$/.exec(s))) return randStr(parseInt(m[1],10));
  if (s === 'string') return randStr(16);
  if ((m = /^array\\((.+)\\)$/.exec(s))) { const inner = m[1]; const n = ri(0, 8); const a = []; for (let i = 0; i < n; i++) a.push(genOne(inner)); return a; }
  return ri(0, 100);
}
function safe(v) { try { return JSON.parse(JSON.stringify(v)); } catch { return String(v); } }
function callFn(fn, input) { return __MULTI ? fn.apply(null, input) : fn(input); }
function outcome(fn, input) {
  try { return { ok: true, v: JSON.stringify(callFn(fn, input)) }; }
  catch (e) { return { ok: false, v: 'threw:' + (e && e.message) }; }
}

for (let i = 0; i < __RUNS; i++) {
  const input = __MULTI ? __GENS.map(genOne) : genOne(__GENS[0]);
  const a = outcome(priorFn, input);
  const b = outcome(newFn, input);
  if (a.v !== b.v) {
    emit({ diverged: true, input: safe(input), priorResult: a.v, newResult: b.v });
    process.exit(0);
  }
}
emit({ diverged: false });
`;
}

/** Parse the single SENTINEL line off the driver's stdout/stderr. */
function parseObservation(out: string): DriverObservation {
  const re = new RegExp(`${SENTINEL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(.*)`, 'm');
  const m = re.exec(out);
  if (!m) return { ran: false, diverged: false };
  try {
    const o = JSON.parse(m[1].trim()) as Partial<DriverObservation>;
    if (o.error) return { ran: false, diverged: false, error: o.error };
    if (o.noPrior) return { ran: false, diverged: false, noPrior: true };
    return {
      ran: true,
      diverged: !!o.diverged,
      input: o.input !== undefined ? JSON.stringify(o.input) : undefined,
      priorResult: o.priorResult,
      newResult: o.newResult,
    };
  } catch {
    return { ran: false, diverged: false, error: 'unparseable driver output' };
  }
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

/**
 * Execute ONE behavioral contract under snapshot → write-prior+new-siblings →
 * run-twice → revert. The TARGET file's bytes are never touched. Determinism: the
 * driver is seeded, so the two runs MUST agree; a disagreement means at least one
 * version is non-deterministic (clock/random/IO) → the comparison is ill-posed →
 * UNJUDGED (the honest ceiling), never red/green-by-guess.
 */
function executeContract(
  ctx: GateContext,
  rel: string,
  spec: BehaviorSpec,
): { red?: GateRed; unjudged?: string } {
  const runner = runnerFor(rel);
  if (!runner) return { unjudged: `no runner for '${path.extname(rel)}' — cannot run the behavior contract` };
  if (!runnerAvailable(runner.cmd, ctx.repoRoot)) {
    return { unjudged: `runner '${runner.cmd}' is not invocable — honest defer (no green-by-assumption)` };
  }
  const newContent = ctx.readFile(rel);
  if (newContent === null) return { unjudged: `cannot read new bytes of '${rel}'` };
  const priorContent = ctx.priorOf(rel);
  if (priorContent === '') return { unjudged: `no prior bytes for '${rel}' — a new file/fn cannot regress its own behavior` };

  const targetAbs = path.join(ctx.repoRoot, rel);
  const dir = path.dirname(targetAbs);
  const ext = runner.ext === '.tsx' ? '.tsx' : runner.ext === '.jsx' ? '.jsx' : runner.ext;
  const tag = crypto.randomBytes(4).toString('hex');
  const priorName = `.__bcprior_${tag}${ext}`;
  const newName = `.__bcnew_${tag}${ext}`;
  const driverName = `.__bcdrv_${tag}${ext}`;
  const priorAbs = path.join(dir, priorName);
  const newAbs = path.join(dir, newName);
  const driverAbs = path.join(dir, driverName);
  const driverSrc = buildDriver(spec, `./${priorName}`, `./${newName}`);
  const cmd = `${runner.cmd} ${JSON.stringify(driverAbs)}`;

  const dirShaBefore = sha(fs.readFileSync(targetAbs)); // the real target, never written
  let obs: DriverObservation[] = [];
  try {
    fs.writeFileSync(priorAbs, priorContent);
    fs.writeFileSync(newAbs, newContent);
    fs.writeFileSync(driverAbs, driverSrc);
    obs = [runDriver(cmd, ctx.repoRoot), runDriver(cmd, ctx.repoRoot)];
  } catch (e) {
    return { unjudged: `behavior harness threw: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    for (const p of [priorAbs, newAbs, driverAbs]) {
      try {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      } catch {
        /* best-effort; the sha check below catches a dirty tree */
      }
    }
  }

  if (sha(fs.readFileSync(targetAbs)) !== dirShaBefore) {
    return { unjudged: `target '${rel}' changed under the harness — refusing to judge on a dirty tree` };
  }
  for (const p of [priorAbs, newAbs, driverAbs]) {
    if (fs.existsSync(p)) return { unjudged: `ephemeral sibling not removed for '${rel}' — refusing to judge on a dirty tree` };
  }

  const [a, b] = obs;
  if (a.error || b.error) return { unjudged: `cannot run behavior contract for '${rel}': ${a.error ?? b.error}` };
  if (a.noPrior || b.noPrior) return { unjudged: `'${spec.fn}' has no prior behavior in '${rel}' — a new fn cannot regress` };
  if (!a.ran || !b.ran) return { unjudged: `behavior driver produced no verdict for '${rel}' (no sentinel) — honest defer` };
  if (a.diverged !== b.diverged || a.input !== b.input || a.priorResult !== b.priorResult || a.newResult !== b.newResult) {
    return {
      unjudged:
        `non-deterministic behavior for '${spec.fn}' in '${rel}' ` +
        `(run1 diverged=${a.diverged} vs run2 diverged=${b.diverged}) ` +
        `— behavioral comparison is ill-posed over a non-deterministic function`,
    };
  }

  if (a.diverged) {
    if (spec.approved) return {}; // GREEN: divergence is co-committed as an approved intent change
    return {
      red: {
        file: rel,
        locus: spec.fn,
        fact:
          `behavioral contract of '${spec.fn}' CHANGED: input ${a.input} now returns ${a.newResult} ` +
          `(was ${a.priorResult}) — a silent divergence with no co-committed ` +
          `\`@behavior-change-approved fn=${spec.fn}\`. Either preserve the behavior or co-commit the intent update.`,
      },
    };
  }
  return {}; // GREEN: no divergence in K seeded samples (probabilistic, not proof)
}

const behaviorContractGate: GateModule = {
  name: 'behavior-contract',
  kind: 'dynamic',
  appliesTo: (rel) => SOURCE_RE.test(rel),

  async run(ctx: GateContext): Promise<GateResult> {
    const note =
      'every @behavior-contract directive: the fn\'s prior observed outputs survive this write over K seeded inputs ' +
      '(green = no divergence found; probabilistic) — a divergence without a co-committed @behavior-change-approved is RED';

    const targets = ctx.changedFiles.length > 0 ? ctx.changedFiles : [];
    const reds: GateRed[] = [];
    const deferrals: string[] = [];
    let count = 0;

    for (const raw of targets) {
      const rel = raw.replaceAll('\\', '/');
      if (!SOURCE_RE.test(rel)) continue;
      const content = ctx.readFile(rel);
      if (content === null) continue;
      const parsed = await parseBehaviorDirective(content, rel);
      if (parsed === 'no-grammar') {
        if (content.includes('@behavior-contract')) deferrals.push(`${rel}: no grammar to read comment nodes`);
        continue;
      }
      if (parsed === null) continue; // no usable behavior fact in a real comment
      count += 1;
      const verdict = executeContract(ctx, rel, parsed);
      if (verdict.red) reds.push(verdict.red);
      else if (verdict.unjudged) deferrals.push(`${rel}: ${verdict.unjudged}`);
    }

    if (count === 0 && deferrals.length === 0) {
      return { gate: this.name, green: true, reds: [], note };
    }
    if (reds.length === 0 && count > 0 && deferrals.length === count) {
      return {
        gate: this.name,
        green: true,
        reds: [],
        note: `${note} — ALL ${count} contract(s) UNJUDGED: ${deferrals.slice(0, 4).join(' | ')}`,
        unjudged: true,
      };
    }
    if (reds.length === 0 && count === 0 && deferrals.length > 0) {
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
          ? `${note} (${deferrals.length} contract(s) unjudged: ${deferrals.slice(0, 2).join(' | ')})`
          : note,
    };
  },
};

export default behaviorContractGate;
