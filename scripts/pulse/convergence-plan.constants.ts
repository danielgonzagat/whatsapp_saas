import type { PulseConvergenceUnit, PulseConvergenceUnitPriority, PulseGateName } from './types';

export const CHECKER_GAP_TYPES = new Set([
  'CHECK_UNAVAILABLE',
  'MANIFEST_MISSING',
  'MANIFEST_INVALID',
  'UNKNOWN_SURFACE',
]);

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

export const EXCLUDED_GATE_UNITS = new Set<PulseGateName>([
  'browserPass',
  'customerPass',
  'operatorPass',
  'adminPass',
  'soakPass',
  'securityPass',
  'staticPass',
]);

export const PRIORITY_RANK: Record<PulseConvergenceUnitPriority, number> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

export const KIND_RANK: Record<PulseConvergenceUnit['kind'], number> = {
  scenario: 0,
  security: 1,
  gate: 2,
  static: 3,
};

export const GATE_PRIORITY: Record<PulseGateName, PulseConvergenceUnitPriority> = {
  scopeClosed: 'P3',
  adapterSupported: 'P3',
  specComplete: 'P3',
  truthExtractionPass: 'P3',
  staticPass: 'P3',
  runtimePass: 'P0',
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
};
