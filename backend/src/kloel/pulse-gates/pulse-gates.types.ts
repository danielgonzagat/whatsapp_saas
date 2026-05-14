/**
 * PCI.4 — Canonical PULSE gate types and contract.
 *
 * Implements docs/contracts/pci/04-pulse-gates.md §2.
 *
 * Every gate is a pure function: state -> verdict. No side effects in the
 * gate itself. Logging, persistence, and circuit-breaker actions happen in
 * the orchestrator that runs the pipeline.
 */

export type GateName =
  | 'no-roleplay'
  | 'lineage-integrity'
  | 'identity-projection'
  | 'no-overclaim'
  | 'truth-mode-honesty'
  | 'origin-immutability'
  | 'evidence-provenance'
  | 'prompt-leakage'
  | 'protected-files-firewall'
  | 'codacy-rigor-enforcer'
  | 'ecosystem-privacy-guard'
  | 'internal-knowledge-leak-guard'
  | 'platform-bias-monitor'
  | 'disclosure-engine';

export type GateMode = 'log_only' | 'hard_fail';

export type GateStatus = 'PASS' | 'FAIL';

export interface GateEvidence {
  readonly path?: string;
  readonly detail?: string;
  readonly eventIds?: readonly string[];
}

export interface GateVerdict {
  readonly gateName: GateName;
  readonly status: GateStatus;
  readonly mode: GateMode;
  readonly reason?: string;
  readonly evidence?: readonly GateEvidence[];
  readonly measuredAt: string;
  readonly measuredBy: string;
}

export interface Gate<TInput> {
  readonly name: GateName;
  readonly mode: GateMode;
  readonly check: (input: TInput) => GateVerdict;
}

export function pass(
  gateName: GateName,
  mode: GateMode,
  measuredBy: string,
): GateVerdict {
  return {
    gateName,
    status: 'PASS',
    mode,
    measuredAt: new Date().toISOString(),
    measuredBy,
  };
}

export function fail(
  gateName: GateName,
  mode: GateMode,
  measuredBy: string,
  reason: string,
  evidence?: readonly GateEvidence[],
): GateVerdict {
  const verdict: GateVerdict = {
    gateName,
    status: 'FAIL',
    mode,
    reason,
    measuredAt: new Date().toISOString(),
    measuredBy,
  };
  if (evidence) {
    return { ...verdict, evidence };
  }
  return verdict;
}
