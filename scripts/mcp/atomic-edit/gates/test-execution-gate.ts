/**
 * gates/test-execution-gate.ts — the exoneration-free TEST-EXECUTION fact (proof
 * #3's named-but-missing "unit/integration test passing" layer), at the dynamic
 * execution tier.
 *
 * A write must not turn a previously-PASSING test command into a FAILING one.
 * That is a fact only EXECUTION settles — the dynamic sibling of the static crivo:
 * where connection-gate proves a wire resolves from bytes, this proves the file's
 * declared test still passes after the change.
 *
 * Self-driving directive (language-agnostic — just a comment in the changed file):
 *
 *   // @test-on-change cmd="<shell command>" [timeoutMs=<n>]
 *
 * {file} substitutes the instrumented file's absolute path, {dir} its temp dir.
 * NOTE: the cmd value is delimited by double-quotes, so the command itself must
 * not contain a double-quote (single-quote inside, or quote-free forms like
 * `test $(grep -c X {file}) -ge 2`).
 *
 * VERDICT (one exoneration-free fact per directive):
 *  - No directive in any changed file → no test-execution fact → notApplicable.
 *  - DETERMINISM required: the command is run on the NEW tree TWICE. If the two
 *    runs DISAGREE on pass/fail → flaky/non-deterministic → UNJUDGED (never
 *    red-by-guess). This is the brutal ceiling, marked honestly.
 *  - NEW-failure-only: the command is also run once against the PRIOR bytes. If it
 *    ALSO failed on prior bytes, the test was already broken → not this write's
 *    claim (UNJUDGED for that directive, not red).
 *  - NEW tree fails deterministically AND prior passed → the write BROKE the test
 *    → RED.
 *
 * MUTATION FIREWALL: this gate runs commands; it never writes source. To compare
 * prior-vs-new it writes the candidate (overlay) bytes to a TEMP COPY of the file
 * and points the command at the temp dir — the real working tree is never mutated.
 *
 * Ceiling (brutal, honest): proves a DETERMINISTIC test command's pass/fail only.
 * Flaky tests, tests reading live external state (DB/network/clock), and tests
 * whose command needs a full installed toolchain are detected as disagreement or
 * runner-error and returned UNJUDGED, never faked green.
 */
import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  type GateContext,
  type GateModule,
  type GateRed,
  type GateResult,
} from './contract.js';

interface TestDirective {
  cmd: string;
  timeoutMs: number;
}

const DIRECTIVE_RE = /@test-on-change\s+cmd="([^"]+)"(?:\s+timeoutMs=(\d+))?/;

function parseDirective(body: string): TestDirective | null {
  const m = DIRECTIVE_RE.exec(body);
  if (!m) return null;
  const timeoutMs = m[2] ? Math.min(Number(m[2]), 120000) : 30000;
  return { cmd: m[1], timeoutMs };
}

/** Run a command with {file}/{dir} substituted; return pass (exit 0) or null on runner error. */
function runTest(cmd: string, fileAbs: string, dirAbs: string, timeoutMs: number): boolean | null {
  const concrete = cmd.replaceAll('{file}', fileAbs).replaceAll('{dir}', dirAbs);
  try {
    const res = childProcess.spawnSync('/bin/bash', ['-c', concrete], {
      cwd: dirAbs,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (res.error) return null; // spawn/timeout error → runner could not decide
    return res.status === 0;
  } catch {
    return null;
  }
}

/** Write `content` to a temp copy of `rel` (basename preserved) and run `cmd` against it. */
function runAgainst(content: string, rel: string, dir: TestDirective): boolean | null {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-test-exec-'));
  const fileAbs = path.join(tmpRoot, path.basename(rel));
  try {
    fs.writeFileSync(fileAbs, content);
    return runTest(dir.cmd, fileAbs, tmpRoot, dir.timeoutMs);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}

const APPLIES_RE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|py|go|rs|java|rb|php)$/i;

const testExecutionGate: GateModule = {
  name: 'test-execution',
  kind: 'dynamic',
  appliesTo(rel: string): boolean {
    return APPLIES_RE.test(rel);
  },
  run(ctx: GateContext): GateResult {
    const note =
      'a write must not turn a previously-passing @test-on-change command into a failing one (deterministic: run twice; NEW-failure-only vs prior bytes)';
    const reds: GateRed[] = [];
    let sawDirective = false;
    let anyJudged = false;
    for (const rel of ctx.changedFiles) {
      if (!APPLIES_RE.test(rel)) continue;
      const newContent = ctx.readFile(rel);
      if (newContent === null) continue;
      const dir = parseDirective(newContent);
      if (!dir) continue;
      sawDirective = true;
      // Determinism: run the NEW content twice.
      const a = runAgainst(newContent, rel, dir);
      const b = runAgainst(newContent, rel, dir);
      if (a === null || b === null || a !== b) continue; // runner error or flaky → unjudged
      const newPasses = a;
      if (newPasses) {
        anyJudged = true;
        continue;
      }
      // NEW deterministically FAILS — was it already failing on prior bytes?
      const prior = ctx.priorOf(rel);
      if (prior === '') continue; // brand-new file → no prior-pass baseline → not this write's regression
      const priorPass = runAgainst(prior, rel, dir);
      if (priorPass === null) continue; // can't establish prior baseline → unjudged
      if (priorPass === false) continue; // already broken → not this write's claim
      anyJudged = true;
      reds.push({
        file: rel,
        locus: `@test-on-change`,
        fact: `this write makes the declared test command FAIL where it passed on the prior bytes: \`${dir.cmd}\``,
      });
    }
    if (!sawDirective) return { gate: this.name, green: true, reds: [], note, notApplicable: true };
    if (reds.length === 0 && !anyJudged) return { gate: this.name, green: true, reds: [], note, unjudged: true };
    return { gate: this.name, green: reds.length === 0, reds, note };
  },
};

export default testExecutionGate;
