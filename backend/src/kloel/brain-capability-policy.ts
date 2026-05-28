/**
 * @deprecated Use canonical path
 * `./mind/coordination/mind-capability-policy` instead.
 * ADR-0013 M1 (Wave 45): legacy brain-* path retained as re-export shim
 * for backward-compat with out-of-tree consumers. Internal callers must
 * import from `./mind/coordination/mind-capability-policy`.
 */
export {
  getBrainCapabilityDelegationContract,
  getBrainCapabilityRisk,
  isBrainCapabilityAllowed,
} from './mind/coordination/mind-capability-policy';
export type {
  BrainCapabilityDelegationContract,
  BrainCapabilityDelegationMode,
  BrainCapabilityRisk,
  BrainCapabilityRiskClass,
} from './mind/coordination/mind-capability-policy';
