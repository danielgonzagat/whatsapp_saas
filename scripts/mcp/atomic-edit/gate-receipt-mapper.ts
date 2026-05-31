/**
 * gate-receipt-mapper.ts — the GATE-SOURCED TRUTH bridge.
 *
 * Today server-tools-h.ts imports ONLY from server-helpers-product-locks: it has
 * ZERO contact with any real gate. So the REAL/runtime_probe tier of a truth_receipt
 * was 100% HAND-SUPPLIED — an agent could attach a FABRICATED runtime_probe evidence
 * item and mint a REAL/100 receipt with no running system behind it. That is exactly
 * the facade the receipt exists to forbid.
 *
 * This module closes that hole by making the REAL tier of a receipt UNFORGEABLE: a
 * runtime_probe evidence item is only honoured if it carries a `gateRunId` that this
 * module MINTED from an actual `runGates(DYNAMIC_GATES, …)` execution. The id is a
 * 256-bit random token recorded ONLY here, in-process, the moment a real gate run
 * settled GREEN. A receipt can no longer claim REAL on a probe it did not run.
 *
 *   runProveDirective()  → writes the directive into a THROWAWAY probe file via the
 *                          SAME atomicWrite byte-floor every tool funnels through,
 *                          runs the DYNAMIC gate set against it, reverts byte-exact
 *                          (the throwaway file is removed — it had no prior bytes),
 *                          and on GREEN mints a GateRunRecord + a fresh gateRunId.
 *   verifyGateRun()      → the receipt's gate: returns the record for a gateRunId, or
 *                          null when the id was never minted by a real run (fabricated
 *                          / replayed-after-restart / from a non-green run).
 *
 * MUTATION FIREWALL: the only write this module performs is the throwaway probe file,
 * through atomicWrite (snapshot/validate/trace), and it is deleted in a finally. The
 * repo source tree is never touched. A gate that throws is honest-unjudged, never a
 * false green — the receipt only accepts a run that was GREEN with ≥1 gate that
 * actually RAN (a gate set that judged nothing is NOT a proof of liveness).
 */
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { REPO_ROOT } from './guard.js';
import { atomicWrite } from './server-helpers-io.js';
import { runGates, DYNAMIC_GATES, type RegistryRun } from './gates/registry.js';

/** A receipt evidence item the mapper emits — gate-sourced, carrying its run id. */
export interface GateSourcedEvidence {
  /** valid EvidenceKind: a real dynamic-gate proof is a runtime_probe (executed, not hand-typed) */
  kind: 'runtime_probe';
  status: 'passed' | 'failed' | 'blocked' | 'not_run';
  /** the unforgeable token — present ONLY when minted by a real green gate run */
  gateRunId?: string;
  summary: string;
  artifactPaths: string[];
}

/** The immutable record of one real dynamic-gate run, keyed by its minted id. */
export interface GateRunRecord {
  gateRunId: string;
  /** the gate verb that drove this proof: 'liveness' (probe) | 'formal' | 'probe-convergence' | … */
  verb: string;
  /** true only when the dynamic gate set ran ≥1 gate and emitted ZERO reds */
  green: boolean;
  /** gates that actually applied to the probe file and ran (a real proof has ≥1) */
  ran: string[];
  /** honest unjudged gates (recorded, never counted as a green proof on their own) */
  unjudged: string[];
  /** the claim this run was minted to back */
  claim: string;
  mintedAt: string;
}

/**
 * The in-process registry of REAL gate runs. A gateRunId is valid IFF it lives here.
 * It is intentionally NOT persisted: a token from a previous process can never be
 * replayed to forge a REAL receipt after a restart — the proof must be re-run live.
 */
const gateRunRegistry = new Map<string, GateRunRecord>();

/** Look up a minted gate-run record. Returns null for any id this process did not mint. */
export function verifyGateRun(gateRunId: string): GateRunRecord | null {
  if (typeof gateRunId !== 'string' || gateRunId.length === 0) return null;
  return gateRunRegistry.get(gateRunId) ?? null;
}

/**
 * True IFF a runtime_probe evidence item is BACKED by a real, green gate run. This is
 * the predicate truth_receipt consults to refuse a hand-attached/fabricated probe.
 */
export function isGateBackedRealProbe(gateRunId: string | undefined): boolean {
  if (gateRunId === undefined) return false;
  const rec = verifyGateRun(gateRunId);
  return rec !== null && rec.green && rec.ran.length > 0;
}

/** test-only: how many real runs this process has minted (used by the proof). */
export function gateRunCount(): number {
  return gateRunRegistry.size;
}

/** Identify the gate verb a directive drives (for the run record + receipt summary). */
function verbOf(directive: string): string {
  if (directive.includes('@model')) return 'formal';
  if (directive.includes('@probe-convergence')) return 'probe-convergence';
  if (directive.includes('@liveness') || /apiFetch\(|fetch\(/.test(directive)) return 'liveness';
  return 'dynamic';
}

export interface ProveResult {
  /** the gate-sourced receipt evidence item (kind=runtime_probe) */
  evidence: GateSourcedEvidence;
  /** the full registry run, surfaced for transparency */
  run: RegistryRun;
  /** the run record (only present on green) */
  record: GateRunRecord | null;
  summaryForHuman: string;
}

/**
 * Write `directive` into a throwaway probe file, run the DYNAMIC gate set against it,
 * revert byte-exact, and map the verdict into a gate-sourced receipt evidence item.
 *
 * GREEN (≥1 gate ran, zero reds)  → kind=runtime_probe status=passed, carrying a fresh
 *                                   minted gateRunId (the unforgeable REAL token).
 * RED  (≥1 red)                   → status=failed, NO gateRunId (a failed run mints
 *                                   nothing — it cannot back a REAL claim).
 * UNJUDGED (no gate ran / all      → status=not_run, NO gateRunId (honest: the system
 *           unjudged)               was not observed → no proof, never green-by-assumption).
 */
export async function runProveDirective(args: {
  claim: string;
  directive: string;
  repoRoot?: string;
}): Promise<ProveResult> {
  const repoRoot = args.repoRoot ?? REPO_ROOT;
  const verb = verbOf(args.directive);
  // .mjs keeps the throwaway a real source file the SOURCE_RE-gated dynamic gates
  // (formal/probe-convergence/liveness) apply to, with no tsconfig dependency.
  const probeRel = `scripts/mcp/atomic-edit/.atomic-prove-${process.pid}-${crypto.randomBytes(6).toString('hex')}.mjs`;
  const probeAbs = path.join(repoRoot, probeRel);

  // The throwaway carries ONLY the directive (a comment is enough for the self-driving
  // formal/probe gates; for liveness the directive itself contains the call-site).
  const content = `// atomic_prove throwaway — reverted byte-exact after the gate run.\n${args.directive}\n`;

  let run: RegistryRun;
  try {
    // Write through the SAME byte-floor every tool funnels through (snapshot/validate/trace).
    atomicWrite(probeAbs, content);
    run = await runGates(DYNAMIC_GATES, repoRoot, new Map<string, string>(), [probeRel]);
  } finally {
    // Revert byte-exact: the file had NO prior bytes, so removing it restores the tree
    // exactly. best-effort; a leaked throwaway is the only residue and is dot-prefixed.
    try {
      if (fs.existsSync(probeAbs)) fs.unlinkSync(probeAbs);
    } catch {
      /* best-effort cleanup; never throws past the revert */
    }
  }

  const greenProof = run.green && run.ran.length > 0;
  if (greenProof) {
    const gateRunId = crypto.randomBytes(32).toString('hex');
    const record: GateRunRecord = {
      gateRunId,
      verb,
      green: true,
      ran: run.ran,
      unjudged: run.unjudged,
      claim: args.claim,
      mintedAt: new Date().toISOString(),
    };
    gateRunRegistry.set(gateRunId, record);
    return {
      evidence: {
        kind: 'runtime_probe',
        status: 'passed',
        gateRunId,
        summary: `gate '${run.ran.join(', ')}' ran GREEN for: ${args.claim}`,
        artifactPaths: [],
      },
      run,
      record,
      summaryForHuman:
        `Prova de gate REAL: ${run.ran.join(', ')} verde (id ${gateRunId.slice(0, 12)}…). ` +
        `runtime_probe sancionada para: ${args.claim}.`,
    };
  }

  // Not green: map honestly, mint NOTHING (no token can back a non-green run).
  const status: GateSourcedEvidence['status'] = run.reds.length > 0 ? 'failed' : 'not_run';
  const why =
    run.reds.length > 0
      ? `RED: ${run.reds.slice(0, 3).map((r) => r.fact).join('; ')}`
      : run.ran.length === 0
        ? 'nenhum gate dinamico aplicavel rodou (sem fato de runtime a provar)'
        : `UNJUDGED: ${run.unjudged.slice(0, 3).join('; ')}`;
  return {
    evidence: {
      kind: 'runtime_probe',
      status,
      summary: `gate run NOT green for '${args.claim}' — ${why}`,
      artifactPaths: [],
    },
    run,
    record: null,
    summaryForHuman: `Sem prova de gate: ${why}. Nenhum gateRunId emitido — runtime_probe NAO sancionada.`,
  };
}
