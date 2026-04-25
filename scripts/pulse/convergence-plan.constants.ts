import type {
  PulseConvergenceProductImpact,
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseGateName,
} from './types';

/** Checker_gap_types. */
export const CHECKER_GAP_TYPES = new Set([
  'CHECK_UNAVAILABLE',
  'MANIFEST_MISSING',
  'MANIFEST_INVALID',
  'UNKNOWN_SURFACE',
]);

/** Security_patterns. */
export const SECURITY_PATTERNS = [
  /ROUTE_NO_AUTH/,
  /HARDCODED_SECRET/,
  /SQL_INJECTION/,
  /CSRF/,
  /XSS/,
  /COOKIE_/,
  /SENSITIVE_DATA/,
  /AUTH_BYPASS/,
  /LGPD_/,
  /CRYPTO_/,
];

/** Excluded_gate_units. */
export const EXCLUDED_GATE_UNITS = new Set<PulseGateName>([
  'browserPass',
  'customerPass',
  'operatorPass',
  'adminPass',
  'soakPass',
  'securityPass',
  'staticPass',
]);

/** Priority_rank. */
export const PRIORITY_RANK: Record<PulseConvergenceUnitPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

/** Kind_rank. */
export const KIND_RANK: Record<PulseConvergenceUnit['kind'], number> = {
  scenario: 0,
  security: 1,
  runtime: 2,
  change: 3,
  dependency: 4,
  gate: 5,
  scope: 6,
  capability: 7,
  flow: 8,
  static: 9,
};

/** Product_impact_rank. */
export const PRODUCT_IMPACT_RANK: Record<PulseConvergenceProductImpact, number> = {
  transformational: 0,
  material: 1,
  enabling: 2,
  diagnostic: 3,
};

/** Gate_priority. */
export const GATE_PRIORITY: Record<PulseGateName, PulseConvergenceUnitPriority> = {
  scopeClosed: 'P3',
  adapterSupported: 'P3',
  specComplete: 'P3',
  truthExtractionPass: 'P3',
  staticPass: 'P3',
  runtimePass: 'P0',
  changeRiskPass: 'P0',
  productionDecisionPass: 'P1',
  browserPass: 'P0',
  flowPass: 'P0',
  invariantPass: 'P2',
  securityPass: 'P2',
  isolationPass: 'P2',
  recoveryPass: 'P2',
  performancePass: 'P2',
  observabilityPass: 'P2',
  customerPass: 'P0',
  operatorPass: 'P1',
  adminPass: 'P1',
  soakPass: 'P3',
  syntheticCoveragePass: 'P3',
  evidenceFresh: 'P3',
  pulseSelfTrustPass: 'P3',
  noOverclaimPass: 'P0',
};
