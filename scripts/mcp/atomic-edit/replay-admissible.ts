import { runRegistryGatesOverEditSync, type RegistryGateRun } from './engine-gate-registry.js';
import { reexecValidate, type EditSnapshot } from './engine-proof-reexec.js';
import { chainHashOf } from './trace.js';
import type { ValidationResult } from './engine.js';
import type { RegistryRun } from './gates/registry.js';

/**
 * Idea #2 — REPLAY-ADMISSIBLE REPOSITORY (proof-carrying repository).
 *
 * A whole version history is ADMISSIBLE iff:
 *  (1) it is a TAMPER-EVIDENT chain — each entry's chainHash recomputes from
 *      parent ‖ after ‖ canonicalJSON(gateVerdict) (the real trace.chainHashOf, no drift), and each
 *      entry's parentSha256 is the prior entry's chainHash (genesis parent === ''); AND
 *  (2) EVERY step is gate-POSITIVE (gateVerdict.green === true) OR carries a RECOMPUTED disproof
 *      (negativeActionProof.recomputed === true) — every reachable state is reachable ONLY by a chain
 *      of proven-positive-or-refuted edits; AND
 *  (3) when a step carries syntacticReexec material, engine.validate is RE-RUN over the embedded
 *      snapshot and the recorded syntax verdict must reproduce and be green; AND
 *  (4) when a step carries dynamicRegistryReexec material, the admitted dynamic gate registry is
 *      RE-RUN over the embedded snapshot and the recorded registry verdict must reproduce and be green.
 *
 * Offline-verifiable by an UNTRUSTED third party from the ledger plus the supplied registry material.
 * Syntactic and dynamic-registry verdicts can now be verified without trusting the producer when their
 * evidence is present. HONEST RESIDUAL: full built-in registry-lattice re-execution remains UNJUDGED
 * until the ledger carries enough gate input to rerun the whole built-in lattice, not only engine.validate
 * and the self-improving dynamic registry.
 */
export interface ReplayLedgerEntry {
  parentSha256: string;
  afterSha256: string;
  gateVerdict?: RegistryRun;
  chainHash: string;
  negativeActionProof?: { recomputed?: boolean; witnessKind?: string };
  syntacticReexec?: { snapshot: EditSnapshot; validation: ValidationResult | null };
  dynamicRegistryReexec?: { repoRoot: string; verdict: RegistryGateRun };
}

export interface ReplayVerdict {
  admissible: boolean;
  entries: number;
  brokenLinks: number;
  unadmittedSteps: number;
  reexecFailures: number;
  reexecUnjudgedSteps: number;
  dynamicRegistryFailures: number;
  dynamicRegistryUnjudgedSteps: number;
  syntacticProducerUntrustedReexec: 'GREEN' | 'RED' | 'UNJUDGED';
  dynamicRegistryProducerUntrustedReexec: 'GREEN' | 'RED' | 'UNJUDGED';
  reason: string;
  /** full built-in per-step registry-lattice RE-EXEC remains the named residual. */
  producerUntrustedReexec: 'UNJUDGED';
}

const normalizeDynamicRun = (run: RegistryGateRun): string => JSON.stringify({
  green: run.green,
  reds: run.reds,
  unjudged: run.unjudged,
  ran: run.ran,
});

export function replayAdmissible(ledger: ReplayLedgerEntry[]): ReplayVerdict {
  let brokenLinks = 0;
  let unadmittedSteps = 0;
  let reexecFailures = 0;
  let reexecUnjudgedSteps = 0;
  let dynamicRegistryFailures = 0;
  let dynamicRegistryUnjudgedSteps = 0;
  for (let i = 0; i < ledger.length; i++) {
    const e = ledger[i];
    let bad = chainHashOf(e.parentSha256, e.afterSha256, e.gateVerdict) !== e.chainHash;
    if (!bad) {
      const expectedParent = i === 0 ? '' : ledger[i - 1].chainHash;
      if (e.parentSha256 !== expectedParent) bad = true;
    }
    if (bad) brokenLinks += 1;
    const gatePositive = e.gateVerdict?.green === true;
    const refuted = e.negativeActionProof?.recomputed === true;
    if (!gatePositive && !refuted) unadmittedSteps += 1;
    if (e.syntacticReexec) {
      const reexec = reexecValidate(e.syntacticReexec.snapshot, e.syntacticReexec.validation, e.afterSha256);
      if (!reexec.reproduces || reexec.recomputed.ok !== true) reexecFailures += 1;
    } else {
      reexecUnjudgedSteps += 1;
    }
    if (e.dynamicRegistryReexec) {
      if (!e.syntacticReexec) {
        dynamicRegistryFailures += 1;
      } else {
        const snapshot = e.syntacticReexec.snapshot;
        const rerun = runRegistryGatesOverEditSync(
          { file: snapshot.file, before: snapshot.before, after: snapshot.after, repoRoot: e.dynamicRegistryReexec.repoRoot },
          e.dynamicRegistryReexec.repoRoot,
        );
        if (
          normalizeDynamicRun(rerun) !== normalizeDynamicRun(e.dynamicRegistryReexec.verdict) ||
          rerun.green !== true
        ) {
          dynamicRegistryFailures += 1;
        }
      }
    } else {
      dynamicRegistryUnjudgedSteps += 1;
    }
  }
  const admissible = brokenLinks === 0 && unadmittedSteps === 0 && reexecFailures === 0 && dynamicRegistryFailures === 0;
  const syntacticProducerUntrustedReexec = reexecFailures > 0
    ? 'RED'
    : reexecUnjudgedSteps > 0
      ? 'UNJUDGED'
      : 'GREEN';
  const dynamicRegistryProducerUntrustedReexec = dynamicRegistryFailures > 0
    ? 'RED'
    : dynamicRegistryUnjudgedSteps > 0
      ? 'UNJUDGED'
      : 'GREEN';
  return {
    admissible,
    entries: ledger.length,
    brokenLinks,
    unadmittedSteps,
    reexecFailures,
    reexecUnjudgedSteps,
    dynamicRegistryFailures,
    dynamicRegistryUnjudgedSteps,
    syntacticProducerUntrustedReexec,
    dynamicRegistryProducerUntrustedReexec,
    reason: admissible
      ? `tamper-evident chain; every step gate-positive or carrying a recomputed disproof; syntactic reexec=${syntacticProducerUntrustedReexec}; dynamic registry reexec=${dynamicRegistryProducerUntrustedReexec}`
      : `not admissible: ${brokenLinks} broken link(s), ${unadmittedSteps} unadmitted step(s), ${reexecFailures} syntactic reexec failure(s), ${dynamicRegistryFailures} dynamic registry reexec failure(s)`,
    producerUntrustedReexec: 'UNJUDGED',
  };
}
