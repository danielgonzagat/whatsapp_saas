// PULSE — Live Codebase Nervous System
// Gate failure and convergence owner lane types (no dependencies, used across layers)

/** Pulse gate failure class type. */
export type PulseGateFailureClass = 'product_failure' | 'missing_evidence' | 'checker_gap';

/** Pulse convergence owner lane type. */
export type PulseConvergenceOwnerLane =
  | 'customer'
  | 'operator-admin'
  | 'security'
  | 'reliability'
  | 'platform';
