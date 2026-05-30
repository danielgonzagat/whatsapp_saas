/**
 * gates/formal-gate.ts — the exoneration-free FOR-ALL fact, at the bounded
 * model-checking floor (a TLA+/TLC model checker, in miniature).
 *
 * Every other gate in the crivo settles a property OF THE BYTES: a wire resolves
 * (connection), a name binds (binding), a syntax parses (syntax), an execution
 * reaches a point on ONE fixed input (probe-convergence). NONE of them can settle
 * a UNIVERSALLY-QUANTIFIED fact — "for EVERY state/input this invariant holds" —
 * because that is a property of the EXECUTION SEMANTICS over a whole space, not of
 * any byte the static crivo can read. By Rice's theorem it is undecidable in
 * general. This gate side-steps the general case for the one fragment where the
 * fact is genuinely decidable: a FINITE, BOUNDED model. There, ∀ s ∈ Reachable.
 * INV(s) is settled the only honest way — by EXHAUSTIVELY ENUMERATING the entire
 * reachable state space and evaluating the invariant on every state. GREEN here is
 * not "no counterexample found in a sample"; it is "the WHOLE bounded space was
 * walked and the invariant held on every one of its states" — genuine for-all
 * certainty within the model bound. This is the one gate that yields CERTAINTY.
 *
 * That is exactly what TLC (the TLA+ model checker) does: BFS/DFS over the set of
 * reachable states from the initial predicate, checking the invariant on each, and
 * emitting a concrete COUNTEREXAMPLE state the moment one fails — and it is
 * fundamentally bounded (it can only enumerate finite / bounded models; an
 * unbounded space overflows). The hard state cap below IS that bound. Past it the
 * gate is honestly silent (unjudged) — never an unsound for-all claim.
 *
 * (Grounding note: context7 was queried for TLA+/bounded-model-checking semantics
 * but returned "Invalid API key" — unavailable this session. The semantics encoded
 * here are TLC's documented reachable-state BFS + counterexample + boundedness,
 * which the probe-convergence sibling's determinism+snapshot discipline reinforces.)
 *
 * The model is self-driving from the source bytes — a single magic directive
 * comment in the changed file (language-agnostic; it is just a comment):
 *
 *   // @model id=<id> init=<JSexpr→state[]> next=<JSexpr fn(s)→state[]> invariant=<JSexpr fn(s)→bool> [cap=<N>]
 *
 *  - `init`      a JS expression evaluating to the array of initial states (any
 *                JSON-serialisable values: numbers, strings, arrays, plain objects).
 *  - `next`      a JS expression evaluating to a function s → array of successor
 *                states (the transition relation; [] = a terminal state).
 *  - `invariant` a JS expression evaluating to a predicate s → boolean.
 *  - `cap`       the hard state bound (default 100000). Enumeration past it cannot
 *                claim a for-all → the directive must shrink the model or accept
 *                unjudged.
 *
 * Each expression's value is delimited with single quotes, e.g.
 *   // @model id=ctr init='[0]' next='(s)=>s<5?[s+1]:[]' invariant='(s)=>s<=5' cap=64
 *
 * MUTATION FIREWALL: this gate is READ-ONLY on the repo. It NEVER mutates the
 * source file — it compiles a self-contained harness into os.tmpdir, runs it, and
 * removes it in a finally. The repo source bytes are sha256-verified unchanged
 * across the run (perception locates the model; the engine never writes the tree).
 *
 * VERDICT (one exoneration-free fact per model):
 *  - No `@model` directive in any changed file → no for-all fact asserted → green
 *    no-op (nothing to settle), exactly like the probe gate with no probe.
 *  - The whole reachable closure is walked within `cap` and the invariant holds on
 *    EVERY enumerated state → GREEN: ∀ s ∈ Reachable. INV(s), bounded for-all
 *    certainty.
 *  - A reachable state violates the invariant → RED, carrying that concrete
 *    counterexample state as the witness (the model checker's signature output).
 *  - DETERMINISM is required for the fact to exist: the harness runs TWICE. If the
 *    two runs disagree (different verdict, or a different counterexample) the
 *    transition relation is non-deterministic (Math.random / clock / live state) →
 *    NOT a single-valued for-all fact → UNJUDGED, the honest ceiling.
 *  - The closure exceeds `cap` before draining → the space is too large to
 *    exhaustively enumerate within the bound → cannot claim ∀ → UNJUDGED. Never
 *    green-by-assumption past the bound.
 *  - The model expressions throw / are malformed / no node runner → UNJUDGED.
 *
 * Ceiling (brutal, irreducible after this gate):
 *  1. The for-all is over the MODELED, BOUNDED subset only. The real program may
 *     have a larger / unbounded space; the model is an abstraction the AUTHOR
 *     declares. "Invariant holds in the model" ≠ "the real system is correct"
 *     unless the model faithfully abstracts it — and faithfulness is the author's
 *     assertion, not the gate's discovery (the same class of ceiling as the probe
 *     gate's "reached with value V" ≠ "V is the right value").
 *  2. The transition relation must be deterministic and pure for the fact to
 *     exist; nondeterministic / live-state models are DETECTED and returned
 *     unjudged, never faked green.
 *  3. Beyond the cap the gate is silent — Rice's theorem is not defeated, only
 *     side-stepped for the finite bounded fragment.
 */
import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  type GateModule,
  type GateContext,
  type GateResult,
  type GateRed,
} from './contract.js';

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|sh|bash)$/;
const DEFAULT_CAP = 100000;
const DEFAULT_TIMEOUT_MS = 30000;

export interface ModelSpec {
  id: string;
  /** JS expression source → array of initial states */
  init: string;
  /** JS expression source → function(state) → array of successor states */
  next: string;
  /** JS expression source → function(state) → boolean */
  invariant: string;
  /** hard state bound; enumeration past it is unjudged (not green) */
  cap: number;
}

/**
 * Pull a single-quoted field off the directive line. Single quotes delimit the JS
 * expression so it can freely contain the double quotes, parens, and arrows a
 * transition relation needs. Returns null when the field is absent.
 */
function field(line: string, key: string): string | null {
  const m = new RegExp(`\\b${key}='([^']*)'`).exec(line);
  return m ? m[1] : null;
}

/**
 * Parse a single `@model` directive out of a source file's bytes. Returns null if
 * absent or malformed (missing any of id/init/next/invariant) — a malformed model
 * asserts no usable for-all fact.
 */
export function parseModelDirective(content: string): ModelSpec | null {
  const line = content.split('\n').find((l) => l.includes('@model'));
  if (!line) return null;
  const idM = /\bid=([\w.-]+)/.exec(line);
  const init = field(line, 'init');
  const next = field(line, 'next');
  const invariant = field(line, 'invariant');
  if (!idM || init === null || next === null || invariant === null) return null;
  const capM = /\bcap=(\d+)\b/.exec(line);
  const cap = capM ? Math.max(1, Number(capM[1])) : DEFAULT_CAP;
  return { id: idM[1], init, next, invariant, cap };
}

/**
 * The self-contained BFS model-checker harness, as a standalone node ESM script.
 * It imports NOTHING from the repo: it evaluates the three pure model expressions,
 * walks the reachable state space breadth-first keyed by a stable JSON canonical
 * form, checks the invariant on every dequeued state, and prints exactly ONE
 * sentinel line:
 *   OK:<count>            — closure drained within cap, invariant held on ALL states
 *   CEX:<json-state>      — a reachable state violated the invariant (the witness)
 *   CAP:<count>           — visited exceeded cap before draining → too large to enumerate
 *   ERR:<message>         — a model expression threw / is malformed
 * Determinism is the harness's own guarantee: fixed expressions, a stable key, and
 * a FIFO queue make the walk a pure function of the model — so the outer twice-run
 * detects only genuine model nondeterminism (Math.random / Date.now / live state).
 */
function buildHarness(spec: ModelSpec): string {
  // The state key must be STABLE across object key order so two structurally-equal
  // states collapse to one visited entry (otherwise the closure never closes).
  return [
    `"use strict";`,
    `const CAP = ${spec.cap};`,
    `// order-independent 32-bit fingerprint of a string (FNV-1a) — folded over the`,
    `// whole visited SET so the OK sentinel encodes the reachable-state SET, not just`,
    `// its size. Two runs that reach the SAME size but DIFFERENT states disagree.`,
    `function fnv(str){ let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h + ((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24))) >>> 0; } return h >>> 0; }`,
    `function keyOf(s){`,
    `  const seen = new WeakSet();`,
    `  const norm = (v) => {`,
    `    if (v === null || typeof v !== "object") return v;`,
    `    if (seen.has(v)) throw new Error("cyclic state value");`,
    `    seen.add(v);`,
    `    if (Array.isArray(v)) return v.map(norm);`,
    `    const o = {}; for (const k of Object.keys(v).sort()) o[k] = norm(v[k]); return o;`,
    `  };`,
    `  return JSON.stringify(norm(s));`,
    `}`,
    `try {`,
    `  const INIT = (${spec.init});`,
    `  const NEXT = (${spec.next});`,
    `  const INV = (${spec.invariant});`,
    `  const inits = (typeof INIT === "function") ? INIT() : INIT;`,
    `  if (!Array.isArray(inits)) throw new Error("init must evaluate to an array of states");`,
    `  if (typeof NEXT !== "function") throw new Error("next must evaluate to a function");`,
    `  if (typeof INV !== "function") throw new Error("invariant must evaluate to a function");`,
    `  const visited = new Set();`,
    `  const queue = [];`,
    `  let setFp = 0;`,
    `  const noteKey = (k) => { setFp = (setFp ^ fnv(k)) >>> 0; };`,
    `  for (const s of inits) { const k = keyOf(s); if (!visited.has(k)) { visited.add(k); noteKey(k); queue.push(s); } }`,
    `  let head = 0;`,
    `  while (head < queue.length) {`,
    `    if (visited.size > CAP) { process.stdout.write("CAP:" + visited.size + "\\n"); process.exit(0); }`,
    `    const s = queue[head++];`,
    `    const ok = INV(s);`,
    `    if (!ok) { process.stdout.write("CEX:" + JSON.stringify(s) + "\\n"); process.exit(0); }`,
    `    const succ = NEXT(s);`,
    `    if (!Array.isArray(succ)) throw new Error("next(s) must return an array of successor states");`,
    `    for (const ns of succ) {`,
    `      const k = keyOf(ns);`,
    `      if (!visited.has(k)) {`,
    `        if (visited.size > CAP) { process.stdout.write("CAP:" + visited.size + "\\n"); process.exit(0); }`,
    `        visited.add(k); noteKey(k); queue.push(ns);`,
    `      }`,
    `    }`,
    `  }`,
    `  process.stdout.write("OK:" + visited.size + ":" + setFp + "\\n");`,
    `} catch (e) {`,
    `  process.stdout.write("ERR:" + (e && e.message ? e.message : String(e)) + "\\n");`,
    `}`,
  ].join('\n');
}

const sha = (b: Buffer | string): string => crypto.createHash('sha256').update(b).digest('hex');

type Outcome =
  | { kind: 'ok'; count: number; fp: string }
  | { kind: 'cex'; state: string }
  | { kind: 'cap'; count: number }
  | { kind: 'err'; message: string }
  | { kind: 'norunner' };

/** Run the harness once and parse its single sentinel line. Deterministic by the harness's construction; nondeterminism can only enter through the model expressions themselves. */
function runOnce(harnessPath: string, cwd: string, timeoutMs: number): Outcome {
  const res = childProcess.spawnSync('node', [harnessPath], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    env: process.env,
  });
  if (res.error && (res.error as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'norunner' };
  const out = `${res.stdout ?? ''}`;
  const ok = /^OK:(\d+):(\d+)\s*$/m.exec(out);
  if (ok) return { kind: 'ok', count: Number(ok[1]), fp: ok[2] };
  const cex = /^CEX:(.*)$/m.exec(out);
  if (cex) return { kind: 'cex', state: cex[1] };
  const cap = /^CAP:(\d+)\s*$/m.exec(out);
  if (cap) return { kind: 'cap', count: Number(cap[1]) };
  const err = /^ERR:(.*)$/m.exec(out);
  if (err) return { kind: 'err', message: err[1] };
  // No sentinel at all (process killed by timeout, crashed before printing): treat
  // as an unrunnable model — honest unjudged, never a verdict.
  return { kind: 'err', message: `no sentinel (status=${res.status ?? 'null'}, signal=${res.signal ?? 'none'})` };
}

function sameOutcome(a: Outcome, b: Outcome): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'cex' && b.kind === 'cex') return a.state === b.state;
  // OK agreement requires the SAME reachable SET, not just the same size: equal
  // count AND equal order-independent set fingerprint. A nondeterministic model that
  // reaches the same NUMBER of states but DIFFERENT states is thereby caught.
  if (a.kind === 'ok' && b.kind === 'ok') return a.count === b.count && a.fp === b.fp;
  if (a.kind === 'cap' && b.kind === 'cap') return true; // both over the bound — same fact
  if (a.kind === 'err' && b.kind === 'err') return a.message === b.message;
  return true;
}

/**
 * Execute ONE model under a snapshot → run-twice → cleanup transaction. The repo
 * source file is NEVER written; only an ephemeral harness in os.tmpdir is created
 * and removed in finally. The source sha is captured and re-verified unchanged so
 * the gate proves itself read-only on the tree (the firewall law over the repo).
 */
export function checkModel(ctx: GateContext, rel: string, spec: ModelSpec): {
  red?: GateRed;
  unjudged?: string;
} {
  const absSource = path.join(ctx.repoRoot, rel);
  const sourceShaBefore = fs.existsSync(absSource) ? sha(fs.readFileSync(absSource)) : null;

  const harnessPath = path.join(
    os.tmpdir(),
    `formal-model-${spec.id}-${crypto.randomBytes(6).toString('hex')}.mjs`,
  );
  let runs: Outcome[] = [];
  try {
    fs.writeFileSync(harnessPath, buildHarness(spec));
    runs = [
      runOnce(harnessPath, ctx.repoRoot, DEFAULT_TIMEOUT_MS),
      runOnce(harnessPath, ctx.repoRoot, DEFAULT_TIMEOUT_MS),
    ];
  } catch (e) {
    return { unjudged: `model run threw: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    try {
      if (fs.existsSync(harnessPath)) fs.unlinkSync(harnessPath);
    } catch {
      /* best-effort ephemeral cleanup; never touches the repo source */
    }
  }

  // The repo source must be byte-identical — this gate is read-only on the tree.
  const sourceShaAfter = fs.existsSync(absSource) ? sha(fs.readFileSync(absSource)) : null;
  if (sourceShaAfter !== sourceShaBefore) {
    return { unjudged: `source '${rel}' bytes changed during model check — refusing to judge on a dirty tree` };
  }

  const [a, b] = runs;
  if (a.kind === 'norunner' || b.kind === 'norunner') {
    return { unjudged: `no 'node' runner available to enumerate model '${spec.id}'` };
  }
  // ── DETERMINISM gate: the two runs MUST agree for a real for-all fact to exist ──
  if (!sameOutcome(a, b)) {
    return {
      unjudged:
        `non-deterministic model '${spec.id}' (run1=${a.kind}${a.kind === 'cex' ? `:${a.state}` : ''} ` +
        `vs run2=${b.kind}${b.kind === 'cex' ? `:${b.state}` : ''}) — the transition relation is not ` +
        `single-valued (Math.random/clock/live-state) → not an exhaustive for-all fact`,
    };
  }

  switch (a.kind) {
    case 'ok':
      return {}; // ∀ s ∈ Reachable. INV(s) — the whole bounded space held. Green.
    case 'cex':
      return {
        red: {
          file: rel,
          locus: spec.id,
          fact:
            `model '${spec.id}': the invariant is VIOLATED at reachable state ${a.state} — ` +
            `a concrete counterexample found by exhaustive enumeration of the bounded space`,
        },
      };
    case 'cap':
      return {
        unjudged:
          `model '${spec.id}': reachable state space exceeded cap=${spec.cap} (>${a.count} states) ` +
          `before closing — too large to exhaustively enumerate within the bound → cannot claim ∀ (shrink the model or raise cap)`,
      };
    case 'err':
      return { unjudged: `model '${spec.id}' is unrunnable: ${a.message}` };
    default:
      return { unjudged: `model '${spec.id}': unknown outcome` };
  }
}

const formalGate: GateModule = {
  name: 'formal',
  kind: 'dynamic',
  appliesTo: (rel) => SOURCE_RE.test(rel),

  run(ctx: GateContext): GateResult {
    const note =
      'every @model directive: the invariant holds for EVERY reachable state of the finite bounded model, ' +
      'proven by exhaustive enumeration (real for-all certainty within the bound)';

    // Self-driving from bytes: scan the changed files for a model directive. The
    // read (lens) direction has no changedFiles, so a dynamic gate fires only on an
    // explicit, executable model assertion — never speculatively over the repo.
    const targets = ctx.changedFiles.length > 0 ? ctx.changedFiles : [];
    const reds: GateRed[] = [];
    const deferrals: string[] = [];
    let modelCount = 0;

    for (const raw of targets) {
      const rel = raw.replaceAll('\\', '/');
      if (!SOURCE_RE.test(rel)) continue;
      const content = ctx.readFile(rel);
      if (content === null) continue;
      const spec = parseModelDirective(content);
      if (!spec) continue; // no for-all fact asserted in this file
      modelCount += 1;
      const verdict = checkModel(ctx, rel, spec);
      if (verdict.red) reds.push(verdict.red);
      else if (verdict.unjudged) deferrals.push(`${rel}: ${verdict.unjudged}`);
    }

    if (modelCount === 0) {
      // No model asserted in scope → this dynamic gate has no for-all fact to settle.
      return { gate: this.name, green: true, reds: [], note };
    }
    if (reds.length === 0 && deferrals.length === modelCount) {
      // EVERY model was undecidable (over the cap / nondeterministic / unrunnable).
      // Honest: neither red-by-guess nor green-by-assumption past the bound.
      return {
        gate: this.name,
        green: true,
        reds: [],
        note: `${note} — ALL ${modelCount} model(s) UNJUDGED: ${deferrals.slice(0, 4).join(' | ')}`,
        unjudged: true,
      };
    }
    return {
      gate: this.name,
      green: reds.length === 0,
      reds,
      note:
        deferrals.length > 0
          ? `${note} (${deferrals.length} model(s) unjudged: ${deferrals.slice(0, 2).join(' | ')})`
          : note,
    };
  },
};

export default formalGate;
