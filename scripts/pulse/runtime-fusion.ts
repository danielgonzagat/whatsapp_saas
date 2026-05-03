/**
 * PULSE Runtime Reality Fusion Engine
 *
 * Fuses signals from observability platforms (Sentry, Datadog, Prometheus),
 * CI/CD (GitHub Actions), code quality (Codecov), and knowledge graph (GitNexus)
 * into a unified runtime reality that can override static analysis priorities.
 *
 * Core rule: "real error > lint, real latency > code smell,
 *              deploy failure > refactor, test regression > new feature"
 */

export {
  mapSignalToCapabilities,
  mapSignalToFlows,
} from './__parts__/runtime-fusion/capability-mapping';
export {
  computeImpactScore,
  rankByRuntimeReality,
  overridePriorities,
} from './__parts__/runtime-fusion/impact-priorities';
export { buildRuntimeFusionState } from './__parts__/runtime-fusion/fusion-builder';
