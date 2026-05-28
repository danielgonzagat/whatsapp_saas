/**
 * @deprecated Use canonical path
 * `./mind/coordination/mind-decide-degrade.filter` instead.
 * ADR-0013 M1 (Wave 45): legacy brain-* path retained as re-export shim
 * for backward-compat with out-of-tree consumers. Internal callers must
 * import from `./mind/coordination/mind-decide-degrade.filter`.
 */
export { MindDecideDegradeFilter as BrainDecideDegradeFilter } from './mind/coordination/mind-decide-degrade.filter';
