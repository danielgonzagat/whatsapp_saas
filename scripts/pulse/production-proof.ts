/**
 * PULSE Wave 5 — Production Proof Engine
 *
 * Evaluates production readiness for every capability in the system by
 * checking all proof dimensions: deploy status, health checks, scenario
 * coverage, runtime probes, observability, Sentry regression, DB side
 * effects, rollback feasibility, and performance budget.
 *
 * Each capability receives an overall proof status. The state is
 * persisted to `.pulse/current/PULSE_PRODUCTION_PROOF.json`.
 */

export { isRollbackPossible } from './__parts__/production-proof/rollback';
export {
  proveCapability,
  computeProofCoverage,
  buildProductionProofState,
} from './__parts__/production-proof/prove-capability';
