/**
 * PULSE Wave 6, Module A — Chaos Engineering Engine.
 *
 * Generates a catalog of chaos scenario definitions for every external
 * dependency, computes blast-radius mappings, and persists the result as
 * {@link ChaosEvidence} at `.pulse/current/PULSE_CHAOS_EVIDENCE.json`.
 *
 * All work is static — no live infrastructure is touched. Every scenario
 * is marked as `not_tested` pending staging execution with Toxiproxy or
 * equivalent network fault injection.
 *
 * ## Dependency detection
 *
 * The engine scans source and PULSE artifacts for external dependencies
 * discovered from imports, environment references, URL hosts, HTTP clients,
 * package usage, runtime signals, and side-effect graph evidence. Each
 * external dependency gets a probe set derived from its observed dependency
 * shape, runtime probe metrics, execution trace durations, and side-effect
 * graph evidence instead of a fixed scenario catalog.
 *
 * Every scenario includes a predicted graceful-degradation path:
 * circuit-breaker trip, fallback-to-cache, queue retry, or user-visible
 * degradation.
 */

export type { ChaosProviderName } from './chaos-engine/__parts__/detection';
export { detectProviders, classifyTargetsFromSource } from './chaos-engine/__parts__/detection';
export {
  computeBlastRadius,
  computeProviderBlastRadius,
} from './chaos-engine/__parts__/blast-radius';
export { generateInjectionConfig } from './chaos-engine/__parts__/injection';
export {
  buildChaosCatalog,
  generateChaosScenarios,
  generateProviderScenarios,
} from './chaos-engine/__parts__/scenarios';
