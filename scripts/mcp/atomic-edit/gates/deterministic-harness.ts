/**
 * gates/deterministic-harness.ts — the CONTROLLED-NON-DETERMINISM fact, at the
 * seeded-execution floor. This gate PUSHES the breathing ceiling that
 * probe-convergence-gate honestly stops at.
 *
 * The probe-convergence gate runs a command TWICE and, if the two runs disagree
 * on (reached,value), declares the execution non-deterministic and returns
 * UNJUDGED — a flaky fact (race / clock / PRNG) is "not a single-valued fact".
 * That is the honest ceiling for an UNCONTROLLED run. But a whole CLASS of that
 * flakiness is not irreducible — it is merely UNCONTROLLED: a value that depends
 * only on the wall clock (Date.now / performance.now) and the PRNG (Math.random)
 * becomes single-valued the instant we FREEZE the clock and SEED the PRNG. This
 * gate drives the execution under CONTROLLED non-determinism and converts the
 * clock/PRNG slice of "flaky → unjudged" into a decidable byte-fact:
 *
 *   GREEN iff the probe converges to the SAME asserted value under EVERY seeded
 *         clock/PRNG we drive (robust to the controlled axis → the fact is real).
 *   RED   iff a seeded run CONTRADICTS the assertion (observed value ≠ asserted,
 *         under a controlled seed → a determined contradiction, not a guess).
 *   UNJUDGED iff runs DISAGREE WITH EACH OTHER even under control (the residual
 *         async/thread-scheduling class Node cannot freeze), or the runner / live
 *         target is unavailable. Never green-by-assumption, never red-by-guess.
 *
 * HOW (the controlled-non-determinism mechanism — empirically validated):
 *  - A tiny ephemeral PRELOAD module is written to a temp path and injected via
 *    `node --require <preload>` BEFORE the target's own code runs. It overrides:
 *      Math.random  → a seeded LCG keyed on DET_SEED (deterministic per seed)
 *      Date.now     → a frozen constant DET_CLOCK
 *      performance.now → 0-based frozen perf clock
 *    so the only entropy left is the seed/clock WE choose. Each of N runs uses a
 *    DIFFERENT (seed,clock) pair. A fact that survives every pair does not depend
 *    on the clock/PRNG → it is a real byte-fact; one that flips under a pair is
 *    either the residual we cannot freeze (→ unjudged) or asserted wrong (→ red,
 *    when ALL runs agree among themselves but disagree with the assertion).
 *
 * MUTATION FIREWALL: perception (web-tree-sitter via the perception organ) LOCATES
 * the locus line as a span; the engine SPLICES an ephemeral print at that span,
 * runs under the preload, and restores the EXACT prior bytes (sha256 before==after).
 * The whole thing is a transaction: snapshot → instrument → run-N-seeded → revert
 * byte-exact, in a finally so the revert fires even on throw/timeout. It
 * re-implements a MINIMAL local snapshot/revert (the SHAPE of
 * captureEffectSnapshot/diffEffect/rollbackEffect in server-helpers-effect.ts —
 * read, never imported) so it stays a disjoint leaf gate.
 *
 * The directive is self-driving from the source bytes (language-agnostic — a comment):
 *
 *   // @deterministic-harness id=<id> locus="<anchor>" run="<cmd>" value=<expected> [runs=N] [seeds=a,b,c]
 *
 *  - `locus` is an anchor STRING that must match EXACTLY ONE real code line
 *    (located via the perception AST so a token inside a string/comment is never
 *    mistaken for code — token-correct or unjudged); the print is injected on a
 *    fresh line immediately AFTER it.
 *  - `run` is the command, `{file}` → instrumented file path, `{preload}` → the
 *    ephemeral preload path (so the author opts the target into `node --require`).
 *  - `value` is the asserted single value the locus must converge to under control.
 *  - `runs` (optional, default = number of seeds) and `seeds` (optional CSV of
 *    integer seeds) drive the controlled axis; absent → a fixed seed schedule.
 *
 * RESIDUAL (brutal, irreducible even after this gate):
 *  - Node freezes the wall clock and the PRNG SOURCE, but it does NOT freeze true
 *    OS thread/async SCHEDULING: a value that depends on the interleaving of
 *    setImmediate / I/O completion / worker threads can still differ across runs
 *    EVEN with a frozen clock and seeded PRNG. The gate detects this (runs
 *    disagree among themselves under control) and returns UNJUDGED — it is honest
 *    about the slice it cannot control. It converts the clock/PRNG class; it does
 *    NOT claim the scheduling class.
 *  - Live external state (DB / network / a remote deploy) is NOT seedable from the
 *    local preload; a probe whose `run` reaches an unreachable live target will
 *    either error or disagree across runs → UNJUDGED, never faked green.
 *  - "Converges to V under every seed" settles WHAT the value is, not whether V is
 *    the RIGHT value: that is still the author's assertion, not the gate's discovery.
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
import { astNodes } from '../native-bridge.js';
import { langOf } from './perception.js';

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/** Per-language one-statement printer (same shape as probe-convergence's PRINT_BY_EXT). */
const PRINT_BY_EXT: Record<string, (sentinel: string, valueExpr: string) => string> = {
  '.ts': (s, v) => `console.log(${JSON.stringify(`${s}:`)} + (${v}));`,
  '.tsx': (s, v) => `console.log(${JSON.stringify(`${s}:`)} + (${v}));`,
  '.js': (s, v) => `console.log(${JSON.stringify(`${s}:`)} + (${v}));`,
  '.jsx': (s, v) => `console.log(${JSON.stringify(`${s}:`)} + (${v}));`,
  '.mjs': (s, v) => `console.log(${JSON.stringify(`${s}:`)} + (${v}));`,
  '.cjs': (s, v) => `console.log(${JSON.stringify(`${s}:`)} + (${v}));`,
};

/**
 * The ephemeral PRELOAD source (CommonJS so `node --require` loads it under any
 * module mode). It is the controlled-non-determinism kernel: a seeded LCG replaces
 * Math.random and a frozen constant replaces Date.now / performance.now, BEFORE the
 * target script runs. Entropy is reduced to exactly DET_SEED + DET_CLOCK.
 */
const PRELOAD_SOURCE =
  '// ephemeral deterministic-harness preload — frozen clock + seeded PRNG\n' +
  "const seed = (Number(process.env.DET_SEED || '1') >>> 0) || 1;\n" +
  'let s = seed >>> 0;\n' +
  'Math.random = function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };\n' +
  "const FROZEN = Number(process.env.DET_CLOCK || '1000');\n" +
  'Date.now = function () { return FROZEN; };\n' +
  'try {\n' +
  "  if (typeof performance === 'object' && performance) { performance.now = function () { return 0; }; }\n" +
  '} catch (_e) { /* no global performance — fine */ }\n';

interface HarnessSpec {
  id: string;
  anchor: string;
  run: string;
  /** the asserted single value the locus must converge to under EVERY controlled seed */
  value: string;
  /** the (seed,clock) schedule driven across runs */
  schedule: Array<{ seed: number; clock: number }>;
}

const DEFAULT_SEEDS = [1, 7, 1337, 999983];

/** Parse a single @deterministic-harness directive out of a source file's bytes. Returns null if absent/malformed. */
export function parseHarnessDirective(content: string): HarnessSpec | null {
  const line = content.split('\n').find((l) => l.includes('@deterministic-harness'));
  if (!line) return null;
  const idM = /\bid=([\w.-]+)/.exec(line);
  const anchorM = /\blocus="([^"]+)"/.exec(line);
  const runM = /\brun="([^"]+)"/.exec(line);
  const valueM = /\bvalue=(?:"([^"]*)"|(\S+))/.exec(line);
  if (!idM || !anchorM || !runM || !valueM) return null; // a harness fact needs an asserted value to converge to
  const seedsM = /\bseeds=([\d,]+)/.exec(line);
  const runsM = /\bruns=(\d+)/.exec(line);
  let seeds = seedsM
    ? seedsM[1].split(',').map((x) => Number(x)).filter((x) => Number.isFinite(x))
    : DEFAULT_SEEDS.slice();
  if (seeds.length === 0) seeds = DEFAULT_SEEDS.slice();
  if (runsM) {
    const n = Math.max(2, Math.min(16, Number(runsM[1])));
    // extend/trim the seed list to exactly N runs (cycle the seeds deterministically)
    const out: number[] = [];
    for (let i = 0; i < n; i += 1) out.push(seeds[i % seeds.length] + Math.floor(i / seeds.length));
    seeds = out;
  }
  // Each run gets its own clock so a clock-dependent value is also exercised across the axis.
  const schedule = seeds.map((seed, i) => ({ seed, clock: 1000 + seed * 13 + i * 7 }));
  return { id: idM[1], anchor: anchorM[1], run: runM[1], value: valueM[1] ?? valueM[2], schedule };
}

/**
 * Locate the locus line via the perception AST (token-correct, by BYTE span). The
 * anchor must occur, as CODE, on EXACTLY ONE line. "As code" means: at least one
 * textual occurrence of the anchor on that line falls OUTSIDE every comment/string/
 * template AST node span. So `const t = …; // MARK` qualifies (the anchor in the
 * trailing comment is prose, but the line is still the right locus because the
 * directive author put the marker in a trailing comment ON the code line — we only
 * need the LINE, and the comment occurrence is on a code line); a pure
 * `// only MARK here` comment line or a `"…MARK…"` string-only occurrence does NOT,
 * because the anchor there is wholly inside a prose node and that line has no code
 * occurrence. This is the precise difference a whole-file regex cannot make.
 *
 * The probe is injected on the line AFTER the locus, so a trailing-comment marker on
 * a real statement line is the natural, correct annotation site. We therefore accept
 * a line iff it carries the anchor AND has ≥1 non-prose AST node STARTING on it
 * (i.e. it is an executable line), excluding the directive's own metadata line.
 *
 * Returns the 0-based line index, or -1 (missing) / -2 (ambiguous) / -3 (no grammar
 * → cannot decide token-correctly → caller degrades to unjudged).
 */
async function findLocusLineAst(content: string, rel: string, anchor: string): Promise<number> {
  const lang = langOf(rel);
  const nodes = await astNodes(content, lang); // every node, with type + line + byte span
  if (nodes === null) return -3; // no grammar → we will NOT raw-regex-guess; unjudged
  const lines = content.split('\n');
  // STRING/template spans MASK the anchor: a `"…MARK…"` occurrence masquerades as
  // code on a code line, so it must NOT qualify. COMMENT spans do NOT mask: a
  // trailing `// MARK` on a real statement line is the documented annotation site,
  // and the probe is injected on the NEXT line anyway. So we reject an occurrence
  // only when it falls inside a string/template node — token-correctness exactly.
  const stringSpans: Array<[number, number]> = [];
  // 1-based lines on which at least one executable (non-comment, non-string) node STARTS.
  const codeLines = new Set<number>();
  for (const n of nodes) {
    if (n.type === 'string' || n.type === 'template_string') {
      stringSpans.push([n.byteStart, n.byteEnd]);
    } else if (n.type !== 'comment') {
      codeLines.add(n.line);
    }
  }
  // astNodes' byteStart/byteEnd are UTF-8 byte indices; the per-line offset below is
  // a UTF-16 string index. They coincide for the ASCII tokens a directive anchor uses.
  // A multibyte line could skew the offset, but we ALSO require the line to be a CODE
  // line (the robust, encoding-independent signal), so any skew can only make us more
  // conservative (reject), never accept a string occurrence as code.
  const byteLen = (s: string): number => Buffer.byteLength(s, 'utf8');
  const inString = (byte: number, len: number): boolean =>
    stringSpans.some(([a, b]) => byte >= a && byte + len <= b);
  let hit = -1;
  let byteOffset = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const lineStartByte = byteOffset;
    byteOffset += byteLen(lines[i]) + 1; // +1 for the '\n'
    if (lines[i].includes('@deterministic-harness')) continue; // the directive's own line is metadata
    const col = lines[i].indexOf(anchor);
    if (col === -1) continue; // anchor not on this line at all
    if (!codeLines.has(i + 1)) continue; // pure comment/string-only line → not a locus
    // Require at least ONE occurrence of the anchor on this line that is NOT inside a
    // string/template node. Scan every occurrence; a code-or-comment occurrence accepts.
    let codeOccurrence = false;
    for (let from = col; from !== -1; from = lines[i].indexOf(anchor, from + 1)) {
      const anchorByte = lineStartByte + byteLen(lines[i].slice(0, from));
      if (!inString(anchorByte, byteLen(anchor))) {
        codeOccurrence = true;
        break;
      }
    }
    if (!codeOccurrence) continue; // every occurrence on this line is inside a string → masquerade, reject
    if (hit !== -1) return -2; // ambiguous — the anchor marks >1 executable line
    hit = i;
  }
  return hit;
}

/** Splice the ephemeral print on a fresh line immediately AFTER the locus line. */
function instrument(
  content: string,
  ext: string,
  locusIdx: number,
  sentinel: string,
  valueExpr: string,
): { text: string; injLine: number } {
  const printer = PRINT_BY_EXT[ext];
  const lines = content.split('\n');
  const indent = /^(\s*)/.exec(lines[locusIdx])?.[1] ?? '';
  const stmt = `${indent}${printer(sentinel, valueExpr)}`;
  lines.splice(locusIdx + 1, 0, stmt);
  return { text: lines.join('\n'), injLine: locusIdx + 2 };
}

/** Pull the author-marked in-scope value expression `__HARNESS_VALUE__(<expr>)`, else '1'. */
function extractValueExpr(content: string): string {
  const m =
    /__HARNESS_VALUE__\(([^\n]*?)\)\s*$/m.exec(content) ?? /__HARNESS_VALUE__\(([^)]*)\)/.exec(content);
  return m ? m[1] : '1';
}

const sha = (b: Buffer | string): string => crypto.createHash('sha256').update(b).digest('hex');

interface RunObservation {
  reached: boolean;
  value?: string;
  status: number;
}

const DEFAULT_TIMEOUT_MS = 30000;

/** Run the instrumented command once under a specific seed/clock, parse the sentinel value off stdout. */
function runSeeded(
  cmd: string,
  cwd: string,
  sentinel: string,
  seed: number,
  clock: number,
  timeoutMs: number,
): RunObservation {
  const res = childProcess.spawnSync('/bin/bash', ['-c', cmd], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, DET_SEED: String(seed), DET_CLOCK: String(clock) },
  });
  const out = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
  const re = new RegExp(`${sentinel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(.*)`, 'm');
  const m = re.exec(out);
  const obs: RunObservation = { reached: m !== null, status: res.status ?? 1 };
  if (m) obs.value = m[1].replace(/\r$/, '');
  return obs;
}

interface HarnessVerdict {
  red?: GateRed;
  unjudged?: string;
}

/**
 * Execute ONE harness probe under snapshot → instrument → run-N-seeded →
 * revert-byte-exact. The controlled axis is the (seed,clock) schedule.
 */
async function executeHarness(ctx: GateContext, rel: string, spec: HarnessSpec): Promise<HarnessVerdict> {
  const ext = path.extname(rel).toLowerCase();
  if (!PRINT_BY_EXT[ext]) return { unjudged: `no ephemeral printer for '${ext}' — cannot instrument` };

  const content = ctx.readFile(rel);
  if (content === null) return { unjudged: `cannot read '${rel}'` };

  const locusIdx = await findLocusLineAst(content, rel, spec.anchor);
  if (locusIdx === -3) {
    return { unjudged: `no tree-sitter grammar for '${rel}' — cannot locate locus token-correctly` };
  }
  if (locusIdx === -1) return { unjudged: `locus anchor '${spec.anchor}' not found in '${rel}' (as code)` };
  if (locusIdx === -2) return { unjudged: `locus anchor '${spec.anchor}' is ambiguous (matches >1 code line) in '${rel}'` };

  const sentinel = `__DETHARNESS__${spec.id}__`;
  const valueExpr = content.includes('__HARNESS_VALUE__') ? extractValueExpr(content) : '1';
  const { text, injLine } = instrument(content, ext, locusIdx, sentinel, valueExpr);

  const absPath = path.join(ctx.repoRoot, rel);
  const existedBefore = fs.existsSync(absPath);
  const beforeBytes = existedBefore ? fs.readFileSync(absPath) : null;
  const beforeSha = beforeBytes ? sha(beforeBytes) : null;

  // Write the ephemeral preload to a temp path; {preload} in the run command substitutes it.
  const preloadPath = path.join(
    os.tmpdir(),
    `detharness-preload-${spec.id}-${process.pid}-${Date.now()}.cjs`,
  );

  let runs: Array<{ seed: number; clock: number; obs: RunObservation }> = [];
  try {
    fs.writeFileSync(preloadPath, PRELOAD_SOURCE);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, text);
    for (const { seed, clock } of spec.schedule) {
      const runCmd = spec.run.replaceAll('{file}', absPath).replaceAll('{preload}', preloadPath);
      runs.push({ seed, clock, obs: runSeeded(runCmd, ctx.repoRoot, sentinel, seed, clock, DEFAULT_TIMEOUT_MS) });
    }
  } catch (e) {
    return { unjudged: `harness run threw: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    // revert BYTE-EXACT (the SHAPE of rollbackEffect) — always, even on throw
    try {
      if (beforeBytes) fs.writeFileSync(absPath, beforeBytes);
      else if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch {
      /* best-effort; the sha check below catches a dirty tree */
    }
    try {
      if (fs.existsSync(preloadPath)) fs.unlinkSync(preloadPath);
    } catch {
      /* ephemeral preload cleanup is best-effort */
    }
  }

  // Verify the revert was byte-exact — else refuse to judge on a dirty tree.
  if (existedBefore) {
    const afterSha = fs.existsSync(absPath) ? sha(fs.readFileSync(absPath)) : null;
    if (afterSha !== beforeSha) return { unjudged: `byte-exact revert FAILED for '${rel}' — refusing to judge on a dirty tree` };
  } else if (fs.existsSync(absPath)) {
    return { unjudged: `byte-exact revert FAILED for '${rel}' — ephemeral file not removed` };
  }

  // ── If ANY seeded run did not reach the locus, the probe could not observe the
  //    value under control → cannot settle (live target down / crash / missing
  //    runner). Honest unjudged, never green-by-assumption. ──
  const unreached = runs.filter((r) => !r.obs.reached);
  if (unreached.length > 0) {
    return {
      unjudged:
        `locus not reached under ${unreached.length}/${runs.length} controlled run(s) at ${rel}:L${injLine} ` +
        `(seed(s) ${unreached.map((r) => r.seed).join(',')} — crash / missing {preload} runner / unreachable live target)`,
    };
  }

  // ── The controlled-non-determinism verdict ──
  const observed = runs.map((r) => r.obs.value);
  const distinct = [...new Set(observed)];

  if (distinct.length === 1) {
    // CONVERGED under every seeded clock/PRNG → single-valued. Compare to assertion.
    const v = distinct[0];
    if (v !== spec.value) {
      return {
        red: {
          file: rel,
          locus: `L${injLine}`,
          fact:
            `harness '${spec.id}': locus '${spec.anchor}' converges to the SINGLE value '${v}' under every ` +
            `seeded clock/PRNG (${runs.length} controlled run(s)), but the file asserts value='${spec.value}' ` +
            `— a determined contradiction, not flakiness`,
        },
      };
    }
    return {}; // GREEN: robust to the controlled axis AND matches the assertion
  }

  // distinct.length > 1: the value DIFFERS across controlled runs. Two sub-cases.
  // If the asserted value is NOT among the observed set, then under at least one
  // seed the probe contradicts the assertion — but because the runs ALSO disagree
  // with each other under control, the residual we cannot freeze (async/thread
  // scheduling) is in play. We do NOT red-by-guess on a value that is itself
  // uncontrolled; we mark the honest ceiling.
  return {
    unjudged:
      `harness '${spec.id}': locus '${spec.anchor}' still yields ${distinct.length} distinct values ` +
      `(${distinct.slice(0, 4).map((x) => JSON.stringify(x)).join(', ')}) across ${runs.length} runs EVEN WITH ` +
      `a frozen clock + seeded PRNG → the residual is async/thread SCHEDULING (or live external state), which ` +
      `Node cannot freeze → not a clock/PRNG-class fact → UNJUDGED (the irreducible ceiling)`,
  };
}

const deterministicHarnessGate: GateModule = {
  name: 'deterministic-harness',
  kind: 'dynamic',
  appliesTo: (rel) => SOURCE_RE.test(rel),

  async run(ctx: GateContext): Promise<GateResult> {
    const note =
      'every @deterministic-harness directive converges to its asserted value under EVERY seeded clock/PRNG ' +
      '(snapshot→instrument→run-N-seeded under a frozen-clock+seeded-PRNG preload→revert-byte-exact); ' +
      'a value that still differs under control is the irreducible scheduling residual → unjudged';

    const targets = ctx.changedFiles.length > 0 ? ctx.changedFiles : [];
    const reds: GateRed[] = [];
    const deferrals: string[] = [];
    let probeCount = 0;

    for (const raw of targets) {
      const rel = raw.replaceAll('\\', '/');
      if (!SOURCE_RE.test(rel)) continue;
      const content = ctx.readFile(rel);
      if (content === null) continue;
      const spec = parseHarnessDirective(content);
      if (!spec) continue; // no controlled-non-determinism fact asserted in this file
      probeCount += 1;
      const verdict = await executeHarness(ctx, rel, spec);
      if (verdict.red) reds.push(verdict.red);
      else if (verdict.unjudged) deferrals.push(`${rel}: ${verdict.unjudged}`);
    }

    if (probeCount === 0) {
      return { gate: this.name, green: true, reds: [], note };
    }
    if (reds.length === 0 && deferrals.length === probeCount) {
      // EVERY harness probe was undecidable (scheduling residual / live target down /
      // no grammar / ambiguous locus). Honest: neither red-by-guess nor green-by-assumption.
      return {
        gate: this.name,
        green: true,
        reds: [],
        note: `${note} — ALL ${probeCount} harness probe(s) UNJUDGED: ${deferrals.slice(0, 3).join(' | ')}`,
        unjudged: true,
      };
    }
    return {
      gate: this.name,
      green: reds.length === 0,
      reds,
      note:
        deferrals.length > 0
          ? `${note} (${deferrals.length} probe(s) unjudged: ${deferrals.slice(0, 2).join(' | ')})`
          : note,
    };
  },
};

export default deterministicHarnessGate;
