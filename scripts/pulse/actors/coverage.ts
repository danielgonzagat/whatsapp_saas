import type {
  PulseCodebaseTruth,
  PulseManifestScenarioSpec,
  PulseResolvedManifest,
  PulseSurfaceClassification,
  PulseSurfaceCoverageEntry,
  PulseSyntheticCoverageEvidence,
} from '../types';
import { inferEvidenceFileName, normalizeEvidenceKey } from '../scenario-mode-registry';

/** Customer evidence artifact filename. */
export const CUSTOMER_ARTIFACT = 'PULSE_CUSTOMER_EVIDENCE.json';
/** Operator evidence artifact filename. */
export const OPERATOR_ARTIFACT = 'PULSE_OPERATOR_EVIDENCE.json';
/** Admin evidence artifact filename. */
export const ADMIN_ARTIFACT = 'PULSE_ADMIN_EVIDENCE.json';
/** Soak evidence artifact filename. */
export const SOAK_ARTIFACT = 'PULSE_SOAK_EVIDENCE.json';
/** Coverage artifact filename. */
export const COVERAGE_ARTIFACT = 'PULSE_SCENARIO_COVERAGE.json';
/** World state artifact filename. */
export const WORLD_STATE_ARTIFACT = 'PULSE_WORLD_STATE.json';
/** Scenario group artifact filename. */
export const SCENARIO_GROUP_ARTIFACT = 'PULSE_SCENARIO_COVERAGE.json';

/** Return unique values preserving Set semantics. */
export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** Normalize a module token for case/separator-insensitive matching. */
export function normalizeModuleToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Normalize a route/pattern for prefix matching. */
export function normalizePathForMatch(value: string): string {
  const normalized = value.replace(/\*+/g, '').replace(/\/+$/, '').toLowerCase();
  return normalized || '/';
}

/** Returns true if `route` matches `pattern` exactly or as prefix. */
export function matchesRoutePattern(route: string, pattern: string): boolean {
  const normalizedRoute = normalizePathForMatch(route);
  const normalizedPattern = normalizePathForMatch(pattern);
  if (!normalizedPattern) {
    return false;
  }
  return normalizedRoute === normalizedPattern || normalizedRoute.startsWith(normalizedPattern);
}

/** Get artifact name for an actor kind. */
export function getArtifactName(kind: 'customer' | 'operator' | 'admin' | 'soak' | string): string {
  const evidenceKey = normalizeEvidenceKey(kind);
  return evidenceKey ? inferEvidenceFileName(evidenceKey) : SOAK_ARTIFACT;
}

/** Classify a page as one of PULSE surface classifications. */
export function classifySurface(
  page: PulseCodebaseTruth['pages'][number],
  resolvedManifest: PulseResolvedManifest,
): PulseSurfaceClassification {
  const moduleEntry = resolvedManifest.modules.find((item) => item.key === page.moduleKey);
  if (!moduleEntry || moduleEntry.moduleKind === 'internal') {
    return 'ops_only';
  }
  if (page.totalInteractions === 0) {
    return 'decorative_only';
  }
  if (
    page.persistedInteractions === 0 &&
    page.backendBoundInteractions === 0 &&
    page.backedDataSources === 0
  ) {
    return 'legacy_shell';
  }
  if (
    resolvedManifest.flowGroups.some(
      (group) =>
        group.flowKind === 'shared_capability' && group.moduleKeys.includes(page.moduleKey),
    )
  ) {
    return 'shared_capability';
  }
  return 'certified_interaction';
}

/** Returns true when a scenario references a given page (by module or route pattern). */
export function scenarioTargetsPage(
  scenario: PulseManifestScenarioSpec,
  page: PulseCodebaseTruth['pages'][number],
): boolean {
  if (scenario.moduleKeys.includes(page.moduleKey)) {
    return true;
  }
  return scenario.routePatterns.some((pattern) => matchesRoutePattern(page.route, pattern));
}

/** Build the synthetic coverage evidence aggregate for the run. */
export function buildSyntheticCoverage(
  codebaseTruth: PulseCodebaseTruth,
  resolvedManifest: PulseResolvedManifest,
  allowedScenarioIds?: Set<string>,
): PulseSyntheticCoverageEvidence {
  const scopedScenarios = resolvedManifest.scenarioSpecs.filter(
    (spec) => !allowedScenarioIds || allowedScenarioIds.has(spec.id),
  );
  const pages = codebaseTruth.pages.filter((page) => {
    if (!allowedScenarioIds || allowedScenarioIds.size === 0) {
      return true;
    }
    return scopedScenarios.some((spec) => scenarioTargetsPage(spec, page));
  });
  const results: PulseSurfaceCoverageEntry[] = pages.map((page) => {
    const matchingScenarios = scopedScenarios.filter((spec) => scenarioTargetsPage(spec, page));
    const classification = classifySurface(page, resolvedManifest);
    const requiresCoverage =
      classification === 'certified_interaction' ||
      classification === 'shared_capability' ||
      classification === 'legacy_shell';
    const covered = !requiresCoverage || matchingScenarios.length > 0;
    return {
      route: page.route,
      group: page.group,
      moduleKey: page.moduleKey,
      moduleName: page.moduleName,
      classification,
      covered,
      actorKinds: unique(matchingScenarios.map((spec) => spec.actorKind)).sort(),
      scenarioIds: matchingScenarios.map((spec) => spec.id).sort(),
      totalInteractions: page.totalInteractions,
      persistedInteractions: page.persistedInteractions,
    };
  });
  const userFacingPages = results.filter((entry) => entry.classification !== 'ops_only').length;
  const uncoveredPages = results
    .filter(
      (entry) =>
        !entry.covered &&
        entry.classification !== 'ops_only' &&
        entry.classification !== 'decorative_only',
    )
    .map((entry) => entry.route)
    .sort();
  const coveredPages = results.filter(
    (entry) => entry.covered && entry.classification !== 'ops_only',
  ).length;
  return {
    executed: true,
    artifactPaths: [COVERAGE_ARTIFACT],
    summary:
      uncoveredPages.length === 0
        ? `Synthetic coverage maps ${coveredPages}/${userFacingPages} non-ops page(s) to declared scenarios.`
        : `Synthetic coverage still leaves ${uncoveredPages.length} user-facing page(s) without scenario coverage.`,
    totalPages: results.length,
    userFacingPages,
    coveredPages,
    uncoveredPages,
    results,
  };
}
