/**
 * @deprecated Use canonical path
 * `./mind/coordination/mind-capability-executor.substrate.helpers` instead.
 * ADR-0013 M1 (Wave 44): legacy brain-* path retained as re-export shim
 * for backward-compat with out-of-tree consumers. Internal callers must
 * import from `./mind/coordination/mind-capability-executor.substrate.helpers`.
 */
export {
  computeDissolutionGaps,
  type DissolutionGap,
} from './mind/coordination/mind-capability-executor.substrate.helpers';
