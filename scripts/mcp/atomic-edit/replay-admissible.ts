import { chainHashOf } from './trace.js';
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
 *      of proven-positive-or-refuted edits.
 *
 * Offline-verifiable by an UNTRUSTED third party from the ledger alone. HONEST RESIDUAL: it verifies
 * the RECORDED, tamper-evident verdict chain; producer-untrusted RE-EXECUTION of the registry over
 * each (before,after) snapshot is the named next step (engine-proof-reexec.ts re-execs the SYNTACTIC
 * verdict today). Until that runs per step, a malicious producer recording a fake green verdict with
 * a matching chainHash is NOT caught here — reported as producerUntrustedReexec:'UNJUDGED'.
 */
export interface ReplayLedgerEntry {
  parentSha256: string;
  afterSha256: string;
  gateVerdict?: RegistryRun;
  chainHash: string;
  negativeActionProof?: { recomputed?: boolean; witnessKind?: string };
}

export interface ReplayVerdict {
  admissible: boolean;
  entries: number;
  brokenLinks: number;
  unadmittedSteps: number;
  reason: string;
  /** the RECORDED verdict chain is verified; producer-untrusted per-step registry RE-EXEC is the named next step. */
  producerUntrustedReexec: 'UNJUDGED';
}

export function replayAdmissible(ledger: ReplayLedgerEntry[]): ReplayVerdict {
  let brokenLinks = 0;
  let unadmittedSteps = 0;
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
  }
  const admissible = brokenLinks === 0 && unadmittedSteps === 0;
  return {
    admissible,
    entries: ledger.length,
    brokenLinks,
    unadmittedSteps,
    reason: admissible
      ? 'tamper-evident chain; every step gate-positive or carrying a recomputed disproof'
      : `not admissible: ${brokenLinks} broken link(s), ${unadmittedSteps} unadmitted step(s)`,
    producerUntrustedReexec: 'UNJUDGED',
  };
}
