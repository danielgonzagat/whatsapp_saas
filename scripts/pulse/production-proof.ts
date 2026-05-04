/**
 * PULSE Wave 5 — Production Proof Engine (Barrel)
 *
 * Re-exports public API from __parts__/dimensions and __parts__/engine.
 */

export { isRollbackPossible } from './production-proof/__parts__/dimensions';
export {
  proveCapability,
  computeProofCoverage,
  buildProductionProofState,
} from './production-proof/__parts__/engine';
export type { ProductionProof, ProductionProofState } from './types.production-proof';
