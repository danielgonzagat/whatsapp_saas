/**
 * gates/probe-convergence-gate.ts — the exoneration-free PROBE-CONVERGENCE fact,
 * at the deterministic-execution floor (the DAP atom, dissolved).
 *
 * DAP (the Debug Adapter Protocol) exists to answer one question interactively:
 * "did control reach point L, and with what value?". For a DETERMINISTIC
 * execution on a FIXED input, that question is not interactive at all — it is a
 * SINGLE-VALUED FACT. No debugger, no breakpoint session, no human stepping: run
 * the fixed command, and the reached-bit and the value at L are whatever they
 * deterministically are, every time.
 *
 * This gate generalises the byte-effect gate (server-tools-converge's
 * effectCommand → apply→run→revert-byte-exact) from "the command exits 0" to "the
 * command converges to the ASSERTED reached-bit/value at the locus". It is the
 * DYNAMIC sibling of the static crivo: where connection-gate proves a wire
 * resolves from bytes alone, this proves an execution reaches a point from a
 * deterministic RUN — the only fact bytes cannot settle on their own.
 *
 * MUTATION FIREWALL: perception (web-tree-sitter / the static gates) LOCATES the
 * locus as a span; this gate SPLICES an ephemeral print at that span, runs, and
 * restores the EXACT prior bytes (sha256-verified before == after). The probe is
 * a transaction: snapshot → instrument → run → revert-byte-exact, in a finally so
 * the revert fires even on throw/timeout. It re-implements a MINIMAL local
 * snapshot/revert (the SHAPE of captureEffectSnapshot/diffEffect/rollbackEffect)
 * rather than importing the shared substrate, so it stays a disjoint leaf.
 *
 * The probe spec is self-driving from the source bytes: a single magic directive
 * comment in the changed file (language-agnostic — it is just a comment):
 *
 *   // @probe-convergence id=<id> locus="<anchor>" run="<cmd, {file} = instrumented path>" reached=<true|false> [value=<expected>]
 *
 *  - `locus` is an anchor STRING that must match EXACTLY ONE line of the file; the
 *    ephemeral print is injected on a fresh line immediately AFTER it (byte-precise).
 *  - `run` is the deterministic command, executed via spawnSync('/bin/bash',['-c',…])
 *    with a timeout and a maxBuffer cap; `{file}` is substituted with the
 *    instrumented file's absolute path.
 *  - `reached` is the asserted reached-bit; `value` (optional) the asserted single
 *    value at the locus.
 *
 * VERDICT (one exoneration-free fact per probe):
 *  - No directive in a changed file → it has NO probe-convergence fact → not judged.
 *  - Anchor missing / matches >1 line, no run command, or no runner → the gate
 *    cannot place or execute the probe → UNJUDGED for that probe (honest defer).
 *  - DETERMINISM is required for the fact to exist: the command is run TWICE. If
 *    the two runs DISAGREE on (reached,value) → the execution is non-deterministic
 *    (race / clock / flaky / live-DB) → NOT a one-shot fact → UNJUDGED. This is the
 *    brutal ceiling, marked honestly, never faked green.
 *  - Both runs agree → the single-valued fact is established. Compare to the
 *    assertion: a contradicting reached-bit or value is the RED.
 *
 * Ceiling (brutal): this proves convergence of a DETERMINISTIC command only.
 * Adversarial scheduling, wall-clock/PRNG nondeterminism, and live external state
 * (DB/network) are NOT single-valued facts — the gate detects the disagreement and
 * returns unjudged rather than red-by-guess or green-by-assumption. It also cannot
 * judge correctness beyond the asserted fact: "reached L with value V" is settled,
 * "V is the RIGHT value" is the author's assertion, not the gate's discovery.
 */
import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  type GateModule,
  type GateContext,
  type GateResult,
  type GateRed,
} from './contract.js';

const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|sh|bash)$/;

/** Per-language one-statement printer: emits SENTINEL + the value expression. Language-agnostic by extension (same idea as the converge engine's EXT_LANG). */
const PRINT_BY_EXT: Record<string, (sentinel: string, valueExpr: string) => string> = {
  '.ts': (s, v) => `console.log(${JSON.stringify(`${s}:`)} + (${v}));`,
  '.tsx': (s, v) => `console.log(${JSON.stringify(`${s}:`)} + (${v}));`,
  '.js': (s, v) => `console.log(${JSON.stringify(`${s}:`)} + (${v}));`,
  '.jsx': (s, v) => `console.log(${JSON.stringify(`${s}:`)} + (${v}));`,
  '.mjs': (s, v) => `console.log(${JSON.stringify(`${s}:`)} + (${v}));`,
  '.cjs': (s, v) => `console.log(${JSON.stringify(`${s}:`)} + (${v}));`,
  '.py': (s, v) => `print(${JSON.stringify(`${s}:`)} + str(${v}))`,
  '.rb': (s, v) => `puts(${JSON.stringify(`${s}:`)} + (${v}).to_s)`,
  '.go': (s, v) => `fmt.Println(${JSON.stringify(`${s}:`)} + ${v})`,
  '.sh': (s, v) => `echo "${s}:$(${v})"`,
  '.bash': (s, v) => `echo "${s}:$(${v})"`,
};

interface ProbeSpec {
  id: string;
  anchor: string;
  run: string;
  reached: boolean;
  /** asserted single value at the locus, or undefined if only the reached-bit is asserted */
  value?: string;
}

/** Parse a single @probe-convergence directive out of a source file's bytes. Returns null if absent or malformed. */
export function parseProbeDirective(content: string): ProbeSpec | null {
  const line = content.split('\n').find((l) => l.includes('@probe-convergence'));
  if (!line) return null;
  const idM = /\bid=([\w.-]+)/.exec(line);
  const anchorM = /\blocus="([^"]+)"/.exec(line);
  const runM = /\brun="([^"]+)"/.exec(line);
  const reachedM = /\breached=(true|false)\b/.exec(line);
  const valueM = /\bvalue=(?:"([^"]*)"|(\S+))/.exec(line);
  if (!idM || !anchorM || !runM || !reachedM) return null; // malformed → no usable probe fact
  const spec: ProbeSpec = {
    id: idM[1],
    anchor: anchorM[1],
    run: runM[1],
    reached: reachedM[1] === 'true',
  };
  if (valueM) spec.value = valueM[1] ?? valueM[2];
  return spec;
}

/**
 * A line is the locus iff the anchor matches EXACTLY ONE line. Returns the 0-based
 * line index, or -1 if missing / -2 if ambiguous. The directive line itself is
 * METADATA (it carries `locus="<anchor>"`, so the anchor trivially appears there)
 * and is excluded — only real code lines can be a locus.
 */
function findLocusLine(lines: string[], anchor: string): number {
  let hit = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes('@probe-convergence')) continue; // skip the directive's own line
    if (lines[i].includes(anchor)) {
      if (hit !== -1) return -2; // ambiguous — cannot place the probe deterministically
      hit = i;
    }
  }
  return hit;
}

/**
 * Splice the ephemeral print onto a fresh line immediately AFTER the locus line.
 * The injected line is a complete standalone statement (never mid-expression), so
 * it cannot break the surrounding syntax. Returns the new full content + the
 * 1-based injection line for the GateRed locus.
 */
function instrument(
  content: string,
  ext: string,
  locusIdx: number,
  sentinel: string,
  valueExpr: string,
): { text: string; injLine: number } {
  const printer = PRINT_BY_EXT[ext];
  const lines = content.split('\n');
  // Preserve the locus line's leading indentation for the injected statement.
  const indent = /^(\s*)/.exec(lines[locusIdx])?.[1] ?? '';
  const stmt = `${indent}${printer(sentinel, valueExpr)}`;
  lines.splice(locusIdx + 1, 0, stmt);
  return { text: lines.join('\n'), injLine: locusIdx + 2 };
}

const sha = (b: Buffer | string): string => crypto.createHash('sha256').update(b).digest('hex');

interface RunObservation {
  /** the deterministic sentinel-reached bit observed on this run */
  reached: boolean;
  /** the value printed at the locus, or undefined if the sentinel never appeared */
  value?: string;
  /** the process exit status (0 = clean) */
  status: number;
}

/** Run the instrumented command once and parse the reached-bit + value off stdout. Deterministic by construction (fixed bytes, fixed command). */
function runOnce(cmd: string, cwd: string, sentinel: string, timeoutMs: number): RunObservation {
  const res = childProcess.spawnSync('/bin/bash', ['-c', cmd], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    env: process.env,
  });
  const out = `${res.stdout ?? ''}\n${res.stderr ?? ''}`;
  const re = new RegExp(`${sentinel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:(.*)`, 'm');
  const m = re.exec(out);
  const obs: RunObservation = { reached: m !== null, status: res.status ?? 1 };
  if (m) obs.value = m[1].replace(/\r$/, '');
  return obs;
}

const DEFAULT_TIMEOUT_MS = 30000;

/**
 * Execute ONE probe under the snapshot→instrument→run-twice→revert-byte-exact
 * transaction. Returns a verdict for this single probe; the byte-exact revert is
 * guaranteed by the finally block and verified by sha256(before) === sha256(after).
 */
function executeProbe(ctx: GateContext, rel: string, spec: ProbeSpec): {
  red?: GateRed;
  unjudged?: string; // reason, if this probe could not be decided
} {
  const ext = path.extname(rel).toLowerCase();
  if (!PRINT_BY_EXT[ext]) return { unjudged: `no ephemeral printer for '${ext}' — cannot instrument` };

  // Candidate content = overlay wins (the write being judged), else disk.
  const content = ctx.readFile(rel);
  if (content === null) return { unjudged: `cannot read '${rel}'` };

  const lines = content.split('\n');
  const locusIdx = findLocusLine(lines, spec.anchor);
  if (locusIdx === -1) return { unjudged: `locus anchor '${spec.anchor}' not found in '${rel}'` };
  if (locusIdx === -2) return { unjudged: `locus anchor '${spec.anchor}' is ambiguous (matches >1 line) in '${rel}'` };

  const sentinel = `__PROBECONV__${spec.id}__`;
  // The value EXPRESSION the source itself names. When a value is asserted, the
  // author embeds the in-scope expression as the magic token __PROBE_VALUE__(<expr>)
  // on the line they want measured; we print whatever that <expr> resolves to at
  // the locus. When no value is asserted (reached-bit only) the print emits the
  // constant 1 — its presence/absence IS the reached-bit, the value is irrelevant.
  const valueExpr =
    spec.value !== undefined && content.includes('__PROBE_VALUE__')
      ? extractValueExpr(content)
      : '1';
  const { text, injLine } = instrument(content, ext, locusIdx, sentinel, valueExpr);

  const absPath = path.join(ctx.repoRoot, rel);
  // ── snapshot (minimal, local — the SHAPE of captureEffectSnapshot, not the import) ──
  const existedBefore = fs.existsSync(absPath);
  const beforeBytes = existedBefore ? fs.readFileSync(absPath) : null;
  const beforeSha = beforeBytes ? sha(beforeBytes) : null;
  const runCmd = spec.run.replaceAll('{file}', absPath);

  let runs: RunObservation[] = [];
  try {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, text);
    // ── run TWICE: a single-valued fact MUST be deterministic ──
    runs = [
      runOnce(runCmd, ctx.repoRoot, sentinel, DEFAULT_TIMEOUT_MS),
      runOnce(runCmd, ctx.repoRoot, sentinel, DEFAULT_TIMEOUT_MS),
    ];
  } catch (e) {
    return { unjudged: `probe run threw: ${e instanceof Error ? e.message : String(e)}` };
  } finally {
    // ── revert BYTE-EXACT (the SHAPE of rollbackEffect) — always, even on throw ──
    try {
      if (beforeBytes) fs.writeFileSync(absPath, beforeBytes);
      else if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    } catch {
      /* best-effort byte restore; mismatch is caught by the sha check below */
    }
  }

  // Verify the revert was byte-exact — if not, the tree is dirty and we must NOT
  // claim any verdict (honest: a probe that can't clean up cannot be trusted).
  if (existedBefore) {
    const afterSha = fs.existsSync(absPath) ? sha(fs.readFileSync(absPath)) : null;
    if (afterSha !== beforeSha) return { unjudged: `byte-exact revert FAILED for '${rel}' — refusing to judge on a dirty tree` };
  } else if (fs.existsSync(absPath)) {
    return { unjudged: `byte-exact revert FAILED for '${rel}' — ephemeral file not removed` };
  }

  const [a, b] = runs;
  // ── DETERMINISM gate: the two runs MUST agree for the fact to exist ──
  if (a.reached !== b.reached || a.value !== b.value) {
    return {
      unjudged:
        `non-deterministic execution at ${rel}:L${injLine} ` +
        `(run1=${a.reached ? `reached:${a.value}` : 'not-reached'} vs run2=${b.reached ? `reached:${b.value}` : 'not-reached'}) ` +
        `— not a single-valued fact (race/clock/flaky/live-state)`,
    };
  }

  // ── the single-valued fact is established; compare to the assertion ──
  const observedReached = a.reached;
  const observedValue = a.value;
  if (observedReached !== spec.reached) {
    return {
      red: {
        file: rel,
        locus: `L${injLine}`,
        fact:
          `probe '${spec.id}': control ${observedReached ? 'REACHED' : 'did NOT reach'} locus '${spec.anchor}' on a ` +
          `deterministic run, but the file asserts reached=${spec.reached}`,
      },
    };
  }
  if (spec.reached && spec.value !== undefined && observedValue !== spec.value) {
    return {
      red: {
        file: rel,
        locus: `L${injLine}`,
        fact:
          `probe '${spec.id}': reached locus '${spec.anchor}' deterministically with value '${observedValue}', ` +
          `but the file asserts value='${spec.value}'`,
      },
    };
  }
  return {}; // converged: observed fact == asserted fact
}

/**
 * Pull the value expression the author marked with the `__PROBE_VALUE__` token on
 * the SAME line. Grammar: `... __PROBE_VALUE__(<expr>) ...`. Returns `<expr>`, or
 * '1' if the token is malformed (degrades to reached-bit-only, never throws).
 */
function extractValueExpr(content: string): string {
  const m = /__PROBE_VALUE__\(([^\n]*?)\)\s*$/m.exec(content) ?? /__PROBE_VALUE__\(([^)]*)\)/.exec(content);
  return m ? m[1] : '1';
}

const probeConvergenceGate: GateModule = {
  name: 'probe-convergence',
  kind: 'dynamic',
  appliesTo: (rel) => SOURCE_RE.test(rel),

  run(ctx: GateContext): GateResult {
    const note =
      'every @probe-convergence directive converges to its asserted reached-bit/value on a deterministic run (apply→run-twice→revert-byte-exact)';

    // The probe spec is self-driving from bytes: scan the changed files for a
    // directive. Read direction (no changedFiles) judges nothing here — a dynamic
    // gate only fires on an explicit, executable probe assertion.
    const targets = ctx.changedFiles.length > 0 ? ctx.changedFiles : [];
    const reds: GateRed[] = [];
    const deferrals: string[] = [];
    let probeCount = 0;

    for (const raw of targets) {
      const rel = raw.replaceAll('\\', '/');
      if (!SOURCE_RE.test(rel)) continue;
      const content = ctx.readFile(rel);
      if (content === null) continue;
      const spec = parseProbeDirective(content);
      if (!spec) continue; // no probe-convergence fact asserted in this file
      probeCount += 1;
      const verdict = executeProbe(ctx, rel, spec);
      if (verdict.red) reds.push(verdict.red);
      else if (verdict.unjudged) deferrals.push(`${rel}: ${verdict.unjudged}`);
    }

    if (probeCount === 0) {
      // No probe assertion in scope → this dynamic gate has no fact to settle.
      return { gate: this.name, green: true, reds: [], note };
    }
    if (reds.length === 0 && deferrals.length === probeCount) {
      // EVERY probe was undecidable (non-determinism / missing runner / ambiguous
      // locus). Honest: neither red-by-guess nor green-by-assumption.
      return {
        gate: this.name,
        green: true,
        reds: [],
        note: `${note} — ALL ${probeCount} probe(s) UNJUDGED: ${deferrals.slice(0, 4).join(' | ')}`,
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

export default probeConvergenceGate;
