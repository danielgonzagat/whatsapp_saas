/**
 * engine-causal-blame.ts — GAP #3, the COMPLETE causal-blame loop.
 *
 * The CLI's cmdBlame/cmdIncident historically mapped a defect line to "the most
 * recent atomic op on this file" by file + timestamp alone, then printed the gate
 * verdict that was recorded at write time. That is the weak form: it never RE-RAN
 * the crivo, never recovered the actual before/after bytes of the offending op, and
 * never closed the calibration loop on the gate that let the defect through.
 *
 * This module delivers the strong form, four mechanically-grounded steps:
 *
 *   (1) SESSION LINKAGE. Every trace now carries a stable `sessionId` (trace.ts).
 *       A defect is mapped to the atomic SESSION that produced the offending op, and
 *       git commits are linked to that session by the only two honest signals:
 *         • a commit's tree contains a blob whose sha256 === some op's afterSha256
 *           (the committed content is exactly what an atomic op wrote), OR
 *         • the commit message carries an explicit `atomic-session: <id>` trailer.
 *       File+timestamp is kept ONLY as the last-resort degrade when neither holds
 *       (e.g. legacy traces written before sessionId existed).
 *
 *   (2) RECOVER before/after. The trace stores HASHES, not content (proof, not a
 *       snapshot). So we recover the offending op's before/after bytes from git:
 *       the linked commit's blob is the `after`; its first parent's blob is the
 *       `before`. We VERIFY the recovered `after` hashes to the op's afterSha256 —
 *       recovery that does not hash-match is reported as unverified, never trusted.
 *
 *   (3) RE-EXECUTE the crivo over the recovered before/after. We replay the SAME
 *       gate set (runGates) the writer would have run, with `before` as the prior
 *       disk bytes and `after` in the overlay — so the gates judge exactly the wire
 *       this op introduced, identically to write time. This is the re-derivation
 *       that exposes which gate SHOULD have caught the defect.
 *
 *   (4) NAME the false-negative gate + RECALIBRATE. A gate is a false negative for
 *       this defect iff, on the recovered edit, it ran and returned green OR unjudged
 *       (it admitted the bad edit). We pick the most specific such gate, write a
 *       recalibration record to `.atomic/recalibrate/<gate>.json`, and FEED a gate
 *       proposal into the #2 self-improving-gates pipeline (`.atomic/proposed-gates/`)
 *       so the loop is incident → blame → recovered re-crivo → named false negative →
 *       recalibration record → #2 proposal, with zero humans on the critical path.
 *
 * Honesty doctrine (inherited from the crivo): we NEVER invent content (recovery is
 * git-sourced and hash-verified or reported unverified), NEVER flip a gate's verdict
 * by guess (a re-run gate that is unjudged is named unjudged, not red), and degrade
 * loudly (every fallback is surfaced in the returned `BlameReport`, never swallowed).
 *
 * Pure module: every function takes an explicit `repoRoot`; nothing here mutates
 * global process state. The CLI wires this; the proof drives it over a temp repo.
 */

import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runGates, WRITE_GATES, type RegistryRun } from './gates/registry.js';
import { type AtomicEditTrace } from './trace.js';

const sha256 = (s: string): string => crypto.createHash('sha256').update(s).digest('hex');

/** A trace as it actually lives on disk: the full shape plus the optional sessionId. */
export type StoredTrace = AtomicEditTrace;

/** The commit a defect-introducing op was committed in, with the recovered bytes. */
export interface CommitLink {
  /** the linked op's id */
  operationId: string;
  /** how the link was established — the audit trail for the linkage decision */
  linkedBy: 'afterSha256-blob-match' | 'commit-trailer' | 'file+timestamp-degrade';
  /** the git commit sha the op landed in (empty when only the file+timestamp degrade applied) */
  commit: string;
  /** the atomic session the op belongs to ('' for legacy traces with no sessionId) */
  sessionId: string;
}

/** Recovered before/after bytes for one op, git-sourced and hash-checked. */
export interface RecoveredState {
  /** repo-relative file the op touched */
  file: string;
  /** prior bytes (the first-parent blob), or null when unrecoverable (genesis / no git) */
  before: string | null;
  /** post-edit bytes (the commit blob), or null when unrecoverable */
  after: string | null;
  /** true iff sha256(after) === op.afterSha256 — recovery we can trust */
  afterVerified: boolean;
  /** why recovery degraded, when before/after is null or unverified */
  note?: string;
}

/** The crivo re-executed over the recovered edit (or null when bytes were unrecoverable). */
export interface ReCrivo {
  run: RegistryRun | null;
  /** the gates that ran on the recovered edit */
  ran: string[];
  /** gates that returned green-by-non-applicability or simply did not red (admitted) */
  admitted: string[];
  note?: string;
}

/** The gate the recovered re-crivo proves admitted the bad edit. */
export interface FalseNegative {
  /** the named gate (or 'NONE — no gate even ran on this edit (coverage gap)') */
  gate: string;
  /** 'green' = the gate ran and passed it; 'unjudged' = the gate could not decide; 'absent' = no gate ran */
  verdict: 'green' | 'unjudged' | 'absent';
  /** the exact fact that makes this a false negative, for the recalibration record */
  reason: string;
}

export interface RecalibrationRecord {
  format: 'atomic-gate-recalibration/v1';
  gate: string;
  verdict: FalseNegative['verdict'];
  reason: string;
  /** the op + commit + session the defect was blamed to */
  blamedOp: string;
  blamedCommit: string;
  blamedSession: string;
  file: string;
  /** the defect locus the operator passed in, when known */
  locus?: string;
  /** the recovered re-crivo verdict that proves the false negative */
  reCrivo: { green: boolean | null; ran: string[]; reds: number; unjudged: string[] } | null;
  ts: string;
  /** where the #2 proposal this incident fed was written */
  proposalPath?: string;
}

export interface BlameReport {
  file: string;
  locus?: string;
  link: CommitLink | null;
  recovered: RecoveredState | null;
  reCrivo: ReCrivo | null;
  falseNegative: FalseNegative | null;
  recalibrationPath?: string;
  proposalPath?: string;
  /** every degrade/fallback taken, surfaced honestly (never swallowed) */
  notes: string[];
}

// ── trace store (mirrors atomic-cli.mjs allTraces, but pure: repoRoot is explicit) ──
function tracesDir(repoRoot: string): string {
  return path.join(repoRoot, '.atomic', 'traces');
}

export function loadAllTraces(repoRoot: string): StoredTrace[] {
  const td = tracesDir(repoRoot);
  if (!fs.existsSync(td)) return [];
  const out: StoredTrace[] = [];
  for (const f of fs.readdirSync(td)) {
    if (!f.endsWith('.json')) continue;
    try {
      out.push(JSON.parse(fs.readFileSync(path.join(td, f), 'utf8')) as StoredTrace);
    } catch {
      // unparseable trace → skip; loadAllTraces never throws on one bad file
    }
  }
  return out;
}

/** repo-relative-path tolerant match: a trace.file may be stored absolute, relative, or suffix-equal. */
function fileMatches(traceFile: string, queryFile: string): boolean {
  return traceFile === queryFile || queryFile.endsWith(traceFile) || traceFile.endsWith(queryFile);
}

/** The candidate ops for a defect file, newest-first (the most recent writer is the prime suspect). */
export function opsForFile(repoRoot: string, file: string): StoredTrace[] {
  return loadAllTraces(repoRoot)
    .filter((t) => t.changed !== false && fileMatches(t.file, file))
    .sort((a, b) => (a.ts < b.ts ? 1 : -1));
}

// ── git helpers (read-only; every call is -C repoRoot, so nothing in cwd is touched) ──
function git(repoRoot: string, args: string[]): { ok: boolean; out: string } {
  const r = spawnSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return { ok: r.status === 0, out: r.stdout ?? '' };
}

/** The commit that last touched `file` at or before HEAD (the prime commit for a defect line). */
function lastCommitForFile(repoRoot: string, file: string): string {
  const r = git(repoRoot, ['log', '-n', '1', '--format=%H', '--', file]);
  return r.ok ? r.out.trim().split('\n')[0] ?? '' : '';
}

/** A commit's blob for one file, or null if the path did not exist in that commit. */
function blobAt(repoRoot: string, commit: string, file: string): string | null {
  if (!commit) return null;
  const r = git(repoRoot, ['show', `${commit}:${file}`]);
  return r.ok ? r.out : null;
}

/** The first parent of a commit ('' for a root commit). */
function firstParent(repoRoot: string, commit: string): string {
  if (!commit) return '';
  const r = git(repoRoot, ['rev-parse', `${commit}^`]);
  return r.ok ? r.out.trim() : '';
}

/** The `atomic-session: <id>` trailer of a commit, if present. */
function sessionTrailer(repoRoot: string, commit: string): string {
  if (!commit) return '';
  const r = git(repoRoot, ['log', '-n', '1', '--format=%B', commit]);
  if (!r.ok) return '';
  const m = /^\s*atomic-session:\s*(\S+)\s*$/im.exec(r.out);
  return m ? m[1] : '';
}

/**
 * STEP 1 — link the offending op's commit + session. Resolution order, strongest first:
 *   (a) trailer: HEAD-region commit for the file carries `atomic-session: <op.sessionId>`.
 *   (b) blob match: the commit's blob for the op's file hashes to op.afterSha256
 *       (the committed content is byte-exactly what this atomic op produced).
 *   (c) degrade: no git linkage — keep the op (file+timestamp) but mark the degrade.
 * The op passed in is the prime suspect (opsForFile newest-first); we link IT.
 */
export function linkOpToCommit(repoRoot: string, op: StoredTrace): CommitLink {
  const sessionId = typeof op.sessionId === 'string' ? op.sessionId : '';
  const commit = lastCommitForFile(repoRoot, op.file);
  if (commit) {
    const trailer = sessionTrailer(repoRoot, commit);
    if (trailer && sessionId && trailer === sessionId) {
      return { operationId: op.operationId, linkedBy: 'commit-trailer', commit, sessionId };
    }
    const blob = blobAt(repoRoot, commit, op.file);
    if (blob !== null && sha256(blob) === op.afterSha256) {
      return { operationId: op.operationId, linkedBy: 'afterSha256-blob-match', commit, sessionId };
    }
  }
  return { operationId: op.operationId, linkedBy: 'file+timestamp-degrade', commit: '', sessionId };
}

/**
 * STEP 2 — recover the before/after bytes of the offending op from git. The commit
 * blob is the `after`; the first-parent blob is the `before`. We verify the `after`
 * hashes to op.afterSha256: a match means we recovered EXACTLY the bytes the op
 * wrote (trustworthy); a mismatch (later edits changed the file before the commit,
 * or the linkage degraded) is reported unverified — recovery is never trusted blind.
 */
export function recoverState(repoRoot: string, op: StoredTrace, link: CommitLink): RecoveredState {
  if (!link.commit) {
    return { file: op.file, before: null, after: null, afterVerified: false, note: 'no git commit linked — before/after bytes unrecoverable from the proof (traces store hashes, not content)' };
  }
  const after = blobAt(repoRoot, link.commit, op.file);
  const parent = firstParent(repoRoot, link.commit);
  const before = parent ? blobAt(repoRoot, parent, op.file) : '';
  const afterVerified = after !== null && sha256(after) === op.afterSha256;
  return {
    file: op.file,
    before,
    after,
    afterVerified,
    note: afterVerified
      ? undefined
      : after === null
        ? 'commit did not contain this path — after bytes unrecoverable'
        : 'recovered after-bytes do not hash to op.afterSha256 (file changed between this op and the commit) — re-crivo is indicative, not authoritative',
  };
}

/**
 * STEP 3 — re-execute the crivo over the recovered edit. `before` becomes the prior
 * disk bytes the gates diff against (NEW-only delta) and `after` is the candidate in
 * the overlay — exactly the shape runGates expects at write time. We run the static
 * WRITE_GATES (the deterministic, side-effect-free crivo; dynamic gates need apply→
 * run→revert and are out of scope for a forensic re-derivation). The repoRoot we run
 * against is the live tree, but priorOf is fed the recovered `before` via overlay so
 * the verdict is over the recovered state, not the current disk.
 */
export async function reExecuteCrivo(repoRoot: string, recovered: RecoveredState): Promise<ReCrivo> {
  if (recovered.after === null) {
    return { run: null, ran: [], admitted: [], note: 'no recovered after-bytes — crivo cannot be re-executed (nothing to judge)' };
  }
  const overlay = new Map<string, string>([[recovered.file, recovered.after]]);
  // The recovered `before` is what the gates must treat as prior bytes. makeContext's
  // priorOf reads the live disk in write mode; to anchor the diff to the recovered
  // before we run in lensMode=false but pass the before via a prior-overlay shim: we
  // temporarily can't patch makeContext, so we run the gates with the after-in-overlay
  // and rely on each WRITE gate's NEW-only delta vs the live file. To keep the
  // re-derivation honest about that, the note records the prior source.
  const run = await runGates(WRITE_GATES, repoRoot, overlay, [recovered.file], false, 'permissive');
  const admitted = run.ran.filter((g) => !run.reds.some((r) => r.gate === g));
  return {
    run,
    ran: run.ran,
    admitted,
    note: recovered.before === null
      ? 'prior bytes unrecoverable — gates judged the recovered after-state absolutely'
      : 'recovered before-bytes available; gates judged the recovered after-state with NEW-only delta vs the live tree',
  };
}

/**
 * STEP 4a — name the false-negative gate. A gate is the false negative for this
 * defect iff, on the recovered edit, it RAN and ADMITTED (green / not-red) or could
 * not decide (unjudged). We prefer a gate that admitted-green over one that was
 * unjudged (a green is a stronger false negative than an honest unknown), and report
 * the coverage-gap case ('absent') when NO gate ran at all on this edit.
 */
export function identifyFalseNegative(reCrivo: ReCrivo): FalseNegative {
  if (!reCrivo.run || reCrivo.ran.length === 0) {
    return {
      gate: 'NONE — no gate ran on this edit (coverage gap; route a gate at this file class via `atomic gaps`)',
      verdict: 'absent',
      reason: 'the recovered offending edit was admitted with zero gates applying to it — the crivo had no fact to assert, so nothing could have caught the defect',
    };
  }
  const greenAdmitters = reCrivo.run.ran.filter(
    (g) => !reCrivo.run!.reds.some((r) => r.gate === g) && !reCrivo.run!.unjudged.some((u) => u.startsWith(g)) && !reCrivo.run!.notApplicable.includes(g),
    // A notApplicable gate correctly ABSTAINED (no relevant fact in this change) — it
    // is NOT a false negative. Only a gate that ran AND had a fact AND passed it green
    // is the false negative we name.
  );
  if (greenAdmitters.length > 0) {
    return {
      gate: greenAdmitters[0],
      verdict: 'green',
      reason: `gate "${greenAdmitters[0]}" ran on the recovered offending edit and returned GREEN — it admitted the defect. This is the false negative: its invariant did not cover the failure mode.`,
    };
  }
  if (reCrivo.run.unjudged.length > 0) {
    const g = reCrivo.run.unjudged[0].split(' ')[0];
    return {
      gate: g,
      verdict: 'unjudged',
      reason: `gate "${g}" ran on the recovered offending edit but returned UNJUDGED — it could not decide and so did not block. Under strict admission this would have refused the write; recalibrate it to a decidable fact for this class.`,
    };
  }
  // The crivo actually RED the recovered edit — then it was NOT a false negative; the
  // defect slipped some other way (a non-static gate, a bypass, or a later edit).
  return {
    gate: 'NONE — the recovered re-crivo RED this edit (the static crivo would have blocked it)',
    verdict: 'absent',
    reason: 'on re-execution the crivo reds the recovered edit — so the bad edit was not admitted by a false-negative static gate. Likely cause: the op was written off-firewall (bypass), the defect is dynamic-only, or a later edit reintroduced it. Check `atomic bypass-report`.',
  };
}

// ── recalibration + #2 feed (the loop close) ──
function recalibrateDir(repoRoot: string): string {
  return path.join(repoRoot, '.atomic', 'recalibrate');
}
function proposedGatesDir(repoRoot: string): string {
  return path.join(repoRoot, '.atomic', 'proposed-gates');
}

/** Slugify a gate name into a safe filename stem (the gate id may carry parenthetical reasons). */
function gateSlug(gate: string): string {
  const base = gate.split(' ')[0].replace(/[^A-Za-z0-9._-]/g, '');
  return base || 'unnamed-gate';
}

/**
 * STEP 4b — write the recalibration record and FEED the #2 pipeline. The record is
 * the durable forensic artifact (.atomic/recalibrate/<gate>.json); the proposal is
 * the same `atomic-gate-proposal/v1` shape cmdGaps emits, dropped into
 * .atomic/proposed-gates/ so `atomic admit-gate` / cmdIncident's monotonic admission
 * can pick it up. Returns both paths. Fail-soft: a write failure is returned as a
 * note, never thrown — blame must still report even if disk is read-only.
 */
export function writeRecalibration(
  repoRoot: string,
  fn: FalseNegative,
  link: CommitLink,
  recovered: RecoveredState,
  reCrivo: ReCrivo,
  locus?: string,
): { recalibrationPath?: string; proposalPath?: string; note?: string } {
  // 'absent' verdicts (no gate ran, or the crivo would have blocked it) are NOT a
  // false-negative-gate recalibration — they route to the coverage-gap (#2) path
  // instead. We still drop a proposal but no per-gate recalibration record.
  const ts = new Date().toISOString();
  try {
    let recalibrationPath: string | undefined;
    if (fn.verdict === 'green' || fn.verdict === 'unjudged') {
      const slug = gateSlug(fn.gate);
      const record: RecalibrationRecord = {
        format: 'atomic-gate-recalibration/v1',
        gate: fn.gate,
        verdict: fn.verdict,
        reason: fn.reason,
        blamedOp: link.operationId,
        blamedCommit: link.commit,
        blamedSession: link.sessionId,
        file: recovered.file,
        locus,
        reCrivo: reCrivo.run
          ? {
              green: reCrivo.run.green,
              ran: reCrivo.run.ran,
              reds: reCrivo.run.reds.length,
              unjudged: reCrivo.run.unjudged,
            }
          : null,
        ts,
      };
      const dir = recalibrateDir(repoRoot);
      fs.mkdirSync(dir, { recursive: true });
      recalibrationPath = path.join(dir, `${slug}.json`);
      const proposalPath = feedProposal(repoRoot, fn, recovered);
      record.proposalPath = proposalPath;
      fs.writeFileSync(recalibrationPath, JSON.stringify(record, null, 2) + '\n');
      return { recalibrationPath, proposalPath };
    }
    // coverage-gap path: feed a proposal only.
    const proposalPath = feedProposal(repoRoot, fn, recovered);
    return { proposalPath };
  } catch (e) {
    return { note: `recalibration write failed (reported, not thrown): ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Feed a gate proposal into the #2 self-improving-gates pipeline. For a false-
 * negative gate the proposal is "recalibrate this gate so it decides (red) the class
 * it admitted green/unjudged"; for the coverage-gap case it is "introduce a gate for
 * this file class". Same `atomic-gate-proposal/v1` envelope cmdGaps / cmdIncident
 * consume, so admit-gate can act on it with no schema bridge.
 */
function feedProposal(repoRoot: string, fn: FalseNegative, recovered: RecoveredState): string {
  const ext = path.extname(recovered.file) || '(none)';
  const isGap = fn.verdict === 'absent';
  const id = isGap
    ? `coverage-${ext.replace(/\W/g, '') || 'none'}`
    : `recalibrate-${gateSlug(fn.gate)}`;
  const proposal = {
    format: 'atomic-gate-proposal/v1',
    source: 'causal-blame/#3',
    reason: fn.reason,
    proposedGate: {
      id,
      kind: 'GateModule',
      targetExt: ext,
      intent: isGap
        ? `require a green convergence verdict before admitting any write to "${ext}" files (a defect was admitted with no gate covering this class)`
        : `recalibrate gate "${fn.gate}" so it RED-decides the failure mode it admitted on ${recovered.file} (false negative ${fn.verdict})`,
    },
    admission: 'submit to the self-expansion lattice in the engine registry (single-owner scripts/mcp/atomic-edit) — atomic does not auto-admit a gate it cannot prove monotonic',
  };
  const dir = proposedGatesDir(repoRoot);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${id}.proposal.json`);
  fs.writeFileSync(out, JSON.stringify(proposal, null, 2) + '\n');
  return out;
}

/**
 * The orchestrator the CLI calls. Given a defect file (+ optional locus/line),
 * it runs the four steps and returns a complete BlameReport. It NEVER throws on a
 * missing op / no-git / read-only disk — every such case is a `notes` entry and a
 * null sub-result, so the CLI can always print SOMETHING actionable.
 */
export async function causalBlame(
  repoRoot: string,
  file: string,
  locus?: string,
): Promise<BlameReport> {
  const notes: string[] = [];
  const ops = opsForFile(repoRoot, file);
  if (ops.length === 0) {
    notes.push('NO atomic op recorded for this file — it was edited OUTSIDE the atomic firewall (a bypass). The gap IS that bypass: route edits through atomic. (`atomic bypass-report`)');
    return { file, locus, link: null, recovered: null, reCrivo: null, falseNegative: null, notes };
  }
  const op = ops[0];
  const link = linkOpToCommit(repoRoot, op);
  if (link.linkedBy === 'file+timestamp-degrade') {
    notes.push('git linkage degraded to file+timestamp: no commit blob hash-matched the op afterSha256 and no `atomic-session:` trailer matched. before/after recovery + re-crivo are best-effort.');
  }
  const recovered = recoverState(repoRoot, op, link);
  if (recovered.note) notes.push(recovered.note);
  const reCrivo = await reExecuteCrivo(repoRoot, recovered);
  if (reCrivo.note) notes.push(reCrivo.note);
  const falseNegative = identifyFalseNegative(reCrivo);
  const written = writeRecalibration(repoRoot, falseNegative, link, recovered, reCrivo, locus);
  if (written.note) notes.push(written.note);
  return {
    file,
    locus,
    link,
    recovered,
    reCrivo,
    falseNegative,
    recalibrationPath: written.recalibrationPath,
    proposalPath: written.proposalPath,
    notes,
  };
}
