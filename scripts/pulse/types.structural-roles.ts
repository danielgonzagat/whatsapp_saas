/**
 * Structural Roles — PULSE Capability Modeling
 *
 * Defines the classification layers used by capability/flow/product-vision
 * modules to express the structural roles, status, and truth modes of
 * system components.
 */

/**
 * StructuralRole: The architectural role a module/component plays in the system.
 */
export type StructuralRole =
  | 'interface' // User-facing UI or API contract
  | 'api_surface' // HTTP endpoint or gateway
  | 'orchestration' // Service coordination, state machines
  | 'persistence' // Data model, repository, query
  | 'side_effect' // External call (Stripe, WhatsApp, Email)
  | 'runtime_evidence' // Logging, metrics, tracing
  | 'validation' // DTO guard, authorization, type check
  | 'scenario_coverage' // Test fixture, mock, test suite
  | 'observability' // Instrumentation, monitoring definition
  | 'codacy_hygiene'; // Lint, type, complexity rules

export const STRUCTURAL_ROLES = [
  'interface',
  'api_surface',
  'orchestration',
  'persistence',
  'side_effect',
  'runtime_evidence',
  'validation',
  'scenario_coverage',
  'observability',
  'codacy_hygiene',
] as const satisfies readonly StructuralRole[];

/**
 * CapabilityStatus: The stage of completion for a capability.
 */
export type CapabilityStatus = 'real' | 'partial' | 'latent' | 'phantom';

export const CAPABILITY_STATUSES = [
  'real',
  'partial',
  'latent',
  'phantom',
] as const satisfies readonly CapabilityStatus[];

/**
 * TruthMode: The epistemic certainty of a claim about the system.
 *
 * - 'observed': Directly validated by code scan or runtime.
 * - 'inferred': Derived from related evidence, not directly observed.
 * - 'aspirational': Desired state, not yet implemented.
 */
export type TruthMode = 'observed' | 'inferred' | 'aspirational';

export const TRUTH_MODES = [
  'observed',
  'inferred',
  'aspirational',
] as const satisfies readonly TruthMode[];

/**
 * Type guard: isStructuralRole
 */
export function isStructuralRole(value: unknown): value is StructuralRole {
  return typeof value === 'string' && STRUCTURAL_ROLES.includes(value as StructuralRole);
}

/**
 * Type guard: isCapabilityStatus
 */
export function isCapabilityStatus(value: unknown): value is CapabilityStatus {
  return typeof value === 'string' && CAPABILITY_STATUSES.includes(value as CapabilityStatus);
}

/**
 * Type guard: isTruthMode
 */
export function isTruthMode(value: unknown): value is TruthMode {
  return typeof value === 'string' && TRUTH_MODES.includes(value as TruthMode);
}
