/**
 * Soak structural-observation registry.
 *
 * Maps soak scenario ids to their structural observers. Used by the
 * synthetic-actor evaluator to back `playwright-spec`-runner scenarios with a
 * scan-mode observation when soak mode is requested but live execution is
 * not feasible (e.g. no live backend available in scan mode).
 *
 * The two `operator-*` soak scenarios delegate to the operator structural
 * observers (sibling agent's territory) so the observation logic stays in a
 * single place. Only `system-payment-reconciliation` is owned here, since it
 * is a system-actor scenario with `runner: derived` that depends on
 * reconciliation cron + queue + append-only ledger artifacts.
 */
import { observePaymentReconciliation } from './payment-reconciliation';
import { getOperatorScenarioObserver } from '../operator';
import type { StructuralCheck } from './structural-checks';

/** Soak observation contract — mirrors operator/admin observation shape. */
export interface SoakScenarioObservation {
  /** True when every structural check is present. */
  passed: boolean;
  /** One-line summary suitable for cert reasons. */
  summary: string;
  /** Underlying structural checks. */
  checks: StructuralCheck[];
  /** Always "observed" — no inferred or aspirational soak evidence. */
  truthMode: 'observed';
}

export type SoakScenarioObserver = (rootDir: string) => SoakScenarioObservation;

const OBSERVERS: Record<string, SoakScenarioObserver> = {
  'system-payment-reconciliation': observePaymentReconciliation,
};

/**
 * Resolve the soak observer for a scenario id. Falls back to the operator
 * observer when the scenario id matches an operator scenario observed in soak
 * mode (campaigns/flows, autopilot run).
 */
export function getSoakScenarioObserver(scenarioId: string): SoakScenarioObserver | null {
  if (OBSERVERS[scenarioId]) {
    return OBSERVERS[scenarioId];
  }
  const operatorObserver = getOperatorScenarioObserver(scenarioId);
  if (operatorObserver) {
    return (rootDir: string): SoakScenarioObservation => {
      const observation = operatorObserver(rootDir);
      return {
        passed: observation.passed,
        summary: observation.summary,
        checks: observation.checks,
        truthMode: 'observed',
      };
    };
  }
  return null;
}

/** List of soak scenario ids that have a dedicated observer. */
export function listSoakScenarioIds(): string[] {
  return Object.keys(OBSERVERS).sort();
}
