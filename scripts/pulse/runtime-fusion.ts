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
  computeImpactScore,
  mapSignalToCapabilities,
  mapSignalToFlows,
} from './runtime-fusion/__parts__/mapping';

export {
  buildRuntimeFusionState,
  overridePriorities,
  rankByRuntimeReality,
} from './runtime-fusion/__parts__/builder';
