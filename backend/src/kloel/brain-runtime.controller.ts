/**
 * @deprecated Wave 48 ADR-0013 M1: flipped to canonical mind/coordination path.
 *             Re-export shim retained only as a backward-compat window for any
 *             remaining out-of-tree consumer. New code MUST import from
 *             `./mind/coordination/mind-runtime.controller`.
 * @see docs/adr/0013-kloel-mind-unification.md
 */
export { BrainRuntimeController } from './mind/coordination/mind-runtime.controller';
