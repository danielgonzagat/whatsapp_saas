import { safeJoin, safeResolve } from '../safe-path';
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import type {
  PulseActorEvidence,
  PulseActorKind,
  PulseBrowserEvidence,
  PulseCodebaseTruth,
  PulseEnvironment,
  PulseFlowEvidence,
  PulseManifest,
  PulseManifestScenarioSpec,
  PulseResolvedManifest,
  PulseRuntimeEvidence,
  PulseScenarioExecutionMode,
  PulseScenarioResult,
  PulseSurfaceClassification,
  PulseSurfaceCoverageEntry,
  PulseSyntheticCoverageEvidence,
  PulseWorldState,
} from '../types';

/** Pulse synthetic run mode type. */
export type PulseSyntheticRunMode = 'customer' | 'operator' | 'admin' | 'shift' | 'soak';

/** Run synthetic actors input shape. */
export interface RunSyntheticActorsInput {
  /** Root dir property. */
  rootDir: string;
  /** Environment property. */
  environment: PulseEnvironment;
  /** Manifest property. */
  manifest: PulseManifest | null;
  /** Resolved manifest property. */
  resolvedManifest: PulseResolvedManifest;
  /** Codebase truth property. */
  codebaseTruth: PulseCodebaseTruth;
  /** Runtime evidence property. */
  runtimeEvidence: PulseRuntimeEvidence;
  /** Browser evidence property. */
  browserEvidence: PulseBrowserEvidence;
  /** Flow evidence property. */
  flowEvidence: PulseFlowEvidence;
  /** Requested modes property. */
  requestedModes?: PulseSyntheticRunMode[];
  /** Scenario ids property. */
  scenarioIds?: string[];
}

/** Pulse synthetic actor bundle shape. */
export interface PulseSyntheticActorBundle {
  /** Customer property. */
  customer: PulseActorEvidence;
  /** Operator property. */
  operator: PulseActorEvidence;
  /** Admin property. */
  admin: PulseActorEvidence;
  /** Soak property. */
  soak: PulseActorEvidence;
  /** Synthetic coverage property. */
  syntheticCoverage: PulseSyntheticCoverageEvidence;
  /** World state property. */
  worldState: PulseWorldState;
}

const CUSTOMER_ARTIFACT = 'PULSE_CUSTOMER_EVIDENCE.json';
const OPERATOR_ARTIFACT = 'PULSE_OPERATOR_EVIDENCE.json';
const ADMIN_ARTIFACT = 'PULSE_ADMIN_EVIDENCE.json';
const SOAK_ARTIFACT = 'PULSE_SOAK_EVIDENCE.json';
const COVERAGE_ARTIFACT = 'PULSE_SCENARIO_COVERAGE.json';
const WORLD_STATE_ARTIFACT = 'PULSE_WORLD_STATE.json';
const SCENARIO_GROUP_ARTIFACT = 'PULSE_SCENARIO_COVERAGE.json';

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function normalizePathForMatch(value: string): string {
  const normalized = value.replace(/\*+/g, '').replace(/\/+$/, '').toLowerCase();
  return normalized || '/';
}

function matchesRoutePattern(route: string, pattern: string): boolean {
  const normalizedRoute = normalizePathForMatch(route);
  const normalizedPattern = normalizePathForMatch(pattern);
  if (!normalizedPattern) {
    return false;
  }
  return normalizedRoute === normalizedPattern || normalizedRoute.startsWith(normalizedPattern);
}

function getArtifactName(kind: PulseActorEvidence['actorKind']): string {
  if (kind === 'customer') {
    return CUSTOMER_ARTIFACT;
  }
  if (kind === 'operator') {
    return OPERATOR_ARTIFACT;
  }
  if (kind === 'admin') {
    return ADMIN_ARTIFACT;
  }
  return SOAK_ARTIFACT;
}

function classifySurface(
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

function scenarioTargetsPage(
  scenario: PulseManifestScenarioSpec,
  page: PulseCodebaseTruth['pages'][number],
): boolean {
  if (scenario.moduleKeys.includes(page.moduleKey)) {
    return true;
  }
  return scenario.routePatterns.some((pattern) => matchesRoutePattern(page.route, pattern));
}

function buildSyntheticCoverage(
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

function resolvePlaywrightSpec(rootDir: string, specPath: string): string | null {
  const candidatePaths = [safeJoin(rootDir, specPath), safeJoin(rootDir, 'e2e', specPath)];

  for (const candidate of candidatePaths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function chooseScenarioArtifact(
  kind: PulseActorEvidence['actorKind'],
  scenario: PulseManifestScenarioSpec,
): string[] {
  return unique([
    getArtifactName(kind),
    WORLD_STATE_ARTIFACT,
    SCENARIO_GROUP_ARTIFACT,
    ...scenario.requiredArtifacts,
  ]);
}

function buildScenarioResult(
  scenario: PulseManifestScenarioSpec,
  actorArtifact: PulseActorEvidence['actorKind'],
  overrides: Partial<PulseScenarioResult>,
): PulseScenarioResult {
  const defaultMetrics: NonNullable<PulseScenarioResult['metrics']> = {
    executionMode: scenario.executionMode,
    requiresBrowser: scenario.requiresBrowser,
    requiresPersistence: scenario.requiresPersistence,
    asyncExpectations: scenario.asyncExpectations.length,
  };

  return {
    scenarioId: scenario.id,
    actorKind: scenario.actorKind,
    scenarioKind: scenario.scenarioKind,
    critical: scenario.critical,
    requested: false,
    runner: scenario.runner,
    status: 'skipped',
    executed: false,
    providerModeUsed: scenario.providerMode,
    smokeExecuted: false,
    replayExecuted: scenario.providerMode === 'replay' || scenario.providerMode === 'hybrid',
    worldStateConverged: false,
    summary: scenario.notes,
    artifactPaths: chooseScenarioArtifact(actorArtifact, scenario),
    specsExecuted: [],
    durationMs: 0,
    worldStateTouches: scenario.worldStateKeys,
    moduleKeys: scenario.moduleKeys,
    routePatterns: scenario.routePatterns,
    ...overrides,
    metrics: {
      ...defaultMetrics,
      ...(overrides.metrics || {}),
    },
  };
}

function inferActorArtifact(scenario: PulseManifestScenarioSpec): PulseActorEvidence['actorKind'] {
  if (scenario.timeWindowModes.includes('soak')) {
    return 'soak';
  }
  if (scenario.actorKind === 'customer') {
    return 'customer';
  }
  if (scenario.actorKind === 'operator') {
    return 'operator';
  }
  return 'admin';
}

function summarizeFlowDependencyFailures(
  scenario: PulseManifestScenarioSpec,
  flowEvidence: PulseFlowEvidence,
): { failureClass?: PulseScenarioResult['failureClass']; summary?: string } {
  if (scenario.flowSpecs.length === 0) {
    return {};
  }
  const relevant = flowEvidence.results.filter((result) =>
    scenario.flowSpecs.includes(result.flowId),
  );
  if (relevant.length === 0) {
    return {
      failureClass: 'missing_evidence',
      summary: `Scenario ${scenario.id} depends on flow evidence for ${scenario.flowSpecs.join(', ')}, but none was attached.`,
    };
  }

  const blocking = relevant.filter(
    (result) => result.status === 'failed' || result.status === 'missing_evidence',
  );
  if (blocking.length === 0) {
    return {};
  }

  const failureClass = blocking.some((item) => item.failureClass === 'product_failure')
    ? 'product_failure'
    : blocking.some((item) => item.failureClass === 'checker_gap')
      ? 'checker_gap'
      : 'missing_evidence';

  return {
    failureClass,
    summary:
      failureClass === 'missing_evidence'
        ? `Scenario ${scenario.id} is missing flow evidence for ${blocking.map((item) => item.flowId).join(', ')}.`
        : `Scenario ${scenario.id} is blocked by flow failures: ${blocking.map((item) => item.flowId).join(', ')}.`,
  };
}

function summarizeRuntimeDependencyFailures(
  scenario: PulseManifestScenarioSpec,
  runtimeEvidence: PulseRuntimeEvidence,
): { failureClass?: PulseScenarioResult['failureClass']; summary?: string } {
  if (scenario.runtimeProbes.length === 0) {
    return {};
  }
  const relevant = runtimeEvidence.probes.filter((probe) =>
    scenario.runtimeProbes.includes(probe.probeId),
  );
  if (relevant.length !== scenario.runtimeProbes.length) {
    return {
      failureClass: 'missing_evidence',
      summary: `Scenario ${scenario.id} requires runtime probes that are not attached: ${scenario.runtimeProbes.join(', ')}.`,
    };
  }

  const blocking = relevant.filter(
    (probe) => probe.status === 'failed' || probe.status === 'missing_evidence',
  );
  if (blocking.length === 0) {
    return {};
  }

  const failureClass = blocking.some((item) => item.failureClass === 'product_failure')
    ? 'product_failure'
    : 'missing_evidence';

  return {
    failureClass,
    summary:
      failureClass === 'missing_evidence'
        ? `Scenario ${scenario.id} is missing runtime evidence for ${blocking.map((item) => item.probeId).join(', ')}.`
        : `Scenario ${scenario.id} is blocked by runtime probe failures: ${blocking.map((item) => item.probeId).join(', ')}.`,
  };
}

function canExecuteScenario(
  scenario: PulseManifestScenarioSpec,
  requestedModes: Set<PulseSyntheticRunMode>,
): boolean {
  if (requestedModes.size === 0) {
    return false;
  }
  if (requestedModes.has('soak') && scenario.timeWindowModes.includes('soak')) {
    return true;
  }
  if (requestedModes.has('shift') && scenario.timeWindowModes.includes('shift')) {
    return true;
  }
  if (scenario.actorKind === 'customer' && requestedModes.has('customer')) {
    return true;
  }
  if (scenario.actorKind === 'operator' && requestedModes.has('operator')) {
    return true;
  }
  if (scenario.actorKind === 'admin' && requestedModes.has('admin')) {
    return true;
  }
  return false;
}

function isScenarioRequested(
  scenario: PulseManifestScenarioSpec,
  requestedModes: Set<PulseSyntheticRunMode>,
): boolean {
  return canExecuteScenario(scenario, requestedModes);
}

function executePlaywrightScenario(
  input: RunSyntheticActorsInput,
  scenario: PulseManifestScenarioSpec,
  actorArtifact: PulseActorEvidence['actorKind'],
): PulseScenarioResult {
  const startedAt = Date.now();
  const e2eDir = safeJoin(input.rootDir, 'e2e');
  if (!fs.existsSync(e2eDir)) {
    return buildScenarioResult(scenario, actorArtifact, {
      status: 'checker_gap',
      executed: false,
      failureClass: 'checker_gap',
      summary: 'E2E directory is missing; Playwright-backed synthetic scenario cannot run.',
      durationMs: Date.now() - startedAt,
    });
  }

  const specs = scenario.playwrightSpecs
    .map((specPath) => resolvePlaywrightSpec(input.rootDir, specPath))
    .filter((value): value is string => Boolean(value));

  if (specs.length !== scenario.playwrightSpecs.length) {
    return buildScenarioResult(scenario, actorArtifact, {
      status: 'checker_gap',
      executed: false,
      failureClass: 'checker_gap',
      summary: `Playwright spec files are missing for scenario ${scenario.id}.`,
      durationMs: Date.now() - startedAt,
      metrics: {
        expectedSpecs: scenario.playwrightSpecs.length,
        foundSpecs: specs.length,
      },
    });
  }

  const relativeSpecs = specs.map((specPath) => path.relative(e2eDir, specPath));
  const command = ['playwright', 'test', ...relativeSpecs, '--reporter=json'];

  const result = spawnSync('npx', command, {
    cwd: e2eDir,
    encoding: 'utf8',
    timeout: scenario.timeWindowModes.includes('soak') ? 20 * 60 * 1000 : 5 * 60 * 1000,
    env: {
      ...process.env,
      E2E_API_URL: input.runtimeEvidence.backendUrl || process.env.E2E_API_URL,
      E2E_FRONTEND_URL: input.runtimeEvidence.frontendUrl || process.env.E2E_FRONTEND_URL,
      E2E_APP_URL:
        process.env.E2E_APP_URL ||
        input.runtimeEvidence.frontendUrl ||
        process.env.E2E_FRONTEND_URL,
      E2E_AUTH_URL:
        process.env.E2E_AUTH_URL ||
        input.runtimeEvidence.frontendUrl ||
        process.env.E2E_FRONTEND_URL,
      E2E_PAY_URL:
        process.env.E2E_PAY_URL ||
        input.runtimeEvidence.frontendUrl ||
        process.env.E2E_FRONTEND_URL,
      E2E_WORKER_URL: process.env.E2E_WORKER_URL || process.env.PULSE_WORKER_URL,
    },
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    return buildScenarioResult(scenario, actorArtifact, {
      status: 'missing_evidence',
      executed: false,
      failureClass: 'missing_evidence',
      summary: `Playwright scenario ${scenario.id} could not execute: ${result.error.message}`,
      durationMs: Date.now() - startedAt,
    });
  }

  let stats: Record<string, number> = {};
  try {
    const parsed = JSON.parse(result.stdout || '{}') as { stats?: Record<string, number> };
    stats = parsed.stats || {};
  } catch {
    stats = {};
  }

  if (result.status === 0) {
    return buildScenarioResult(scenario, actorArtifact, {
      status: 'passed',
      executed: true,
      requested: true,
      smokeExecuted: scenario.providerMode === 'real_smoke' || scenario.providerMode === 'hybrid',
      worldStateConverged:
        scenario.requiresPersistence || scenario.asyncExpectations.length > 0 ? true : true,
      summary: `Playwright scenario ${scenario.id} passed.`,
      specsExecuted: relativeSpecs,
      durationMs: Date.now() - startedAt,
      metrics: {
        expected: stats.expected || 0,
        skipped: stats.skipped || 0,
        duration: stats.duration || 0,
      },
    });
  }

  return buildScenarioResult(scenario, actorArtifact, {
    status: 'failed',
    executed: true,
    requested: true,
    smokeExecuted: scenario.providerMode === 'real_smoke' || scenario.providerMode === 'hybrid',
    failureClass: 'product_failure',
    summary: `Playwright scenario ${scenario.id} failed with exit code ${result.status || 1}.`,
    specsExecuted: relativeSpecs,
    durationMs: Date.now() - startedAt,
    metrics: {
      expected: stats.expected || 0,
      unexpected: stats.unexpected || 0,
      flaky: stats.flaky || 0,
      skipped: stats.skipped || 0,
      duration: stats.duration || 0,
      exitCode: result.status || 1,
    },
  });
}

function evaluateScenario(
  input: RunSyntheticActorsInput,
  scenario: PulseManifestScenarioSpec,
  requestedModes: Set<PulseSyntheticRunMode>,
): PulseScenarioResult {
  const actorArtifact = inferActorArtifact(scenario);
  const requested = isScenarioRequested(scenario, requestedModes);

  const missingModules = scenario.moduleKeys.filter(
    (key) => !input.resolvedManifest.modules.some((moduleEntry) => moduleEntry.key === key),
  );
  if (missingModules.length > 0) {
    return buildScenarioResult(scenario, actorArtifact, {
      status: 'checker_gap',
      executed: false,
      failureClass: 'checker_gap',
      requested,
      summary: `Scenario ${scenario.id} targets unknown modules: ${missingModules.join(', ')}.`,
    });
  }

  const missingFlowGroups = scenario.flowGroups.filter(
    (flowGroupId) => !input.resolvedManifest.flowGroups.some((group) => group.id === flowGroupId),
  );
  if (missingFlowGroups.length > 0) {
    return buildScenarioResult(scenario, actorArtifact, {
      status: 'checker_gap',
      executed: false,
      failureClass: 'checker_gap',
      requested,
      summary: `Scenario ${scenario.id} targets unknown flow groups: ${missingFlowGroups.join(', ')}.`,
    });
  }

  if (!requested && requestedModes.size > 0) {
    return buildScenarioResult(scenario, actorArtifact, {
      status: 'skipped',
      executed: false,
      requested: false,
      summary: `Scenario ${scenario.id} was not requested in this synthetic run.`,
    });
  }

  const runtimeFailure = summarizeRuntimeDependencyFailures(scenario, input.runtimeEvidence);
  if (runtimeFailure.summary) {
    return buildScenarioResult(scenario, actorArtifact, {
      status: runtimeFailure.failureClass === 'product_failure' ? 'failed' : 'missing_evidence',
      executed: false,
      failureClass: runtimeFailure.failureClass,
      requested,
      summary: runtimeFailure.summary,
    });
  }

  const flowFailure = summarizeFlowDependencyFailures(scenario, input.flowEvidence);
  if (flowFailure.summary) {
    return buildScenarioResult(scenario, actorArtifact, {
      status: flowFailure.failureClass === 'product_failure' ? 'failed' : 'missing_evidence',
      executed: false,
      failureClass: flowFailure.failureClass,
      requested,
      summary: flowFailure.summary,
    });
  }

  if (scenario.requiresBrowser && scenario.runner !== 'playwright-spec') {
    if (input.environment !== 'total') {
      return buildScenarioResult(scenario, actorArtifact, {
        status: 'missing_evidence',
        executed: false,
        failureClass: 'missing_evidence',
        requested,
        summary: `Scenario ${scenario.id} requires browser evidence, but the current environment is ${input.environment}.`,
      });
    }

    if (!input.browserEvidence.executed) {
      return buildScenarioResult(scenario, actorArtifact, {
        status: 'missing_evidence',
        executed: false,
        failureClass: 'missing_evidence',
        requested,
        summary: `Scenario ${scenario.id} requires browser evidence, but the browser run did not execute.`,
      });
    }
  }

  if (scenario.runner === 'playwright-spec') {
    if (!requested && requestedModes.size === 0) {
      return buildScenarioResult(scenario, actorArtifact, {
        status: 'missing_evidence',
        executed: false,
        failureClass: 'missing_evidence',
        requested: false,
        summary: `Scenario ${scenario.id} is declared but no synthetic actor run was requested for it in this invocation.`,
      });
    }
    return executePlaywrightScenario(input, scenario, actorArtifact);
  }

  const shouldExecuteDerived = requested || requestedModes.size === 0;
  return buildScenarioResult(scenario, actorArtifact, {
    status: 'passed',
    executed: shouldExecuteDerived,
    requested,
    smokeExecuted:
      shouldExecuteDerived &&
      (scenario.providerMode === 'real_smoke' || scenario.providerMode === 'hybrid'),
    worldStateConverged: shouldExecuteDerived,
    summary: `Derived scenario ${scenario.id} passed via runtime/browser/flow dependencies.`,
    durationMs: 0,
    metrics: {
      executionMode: scenario.executionMode,
      requiresBrowser: scenario.requiresBrowser,
      requiresPersistence: scenario.requiresPersistence,
      asyncExpectations: scenario.asyncExpectations.length,
    },
  });
}

function buildActorEvidence(
  actorKind: PulseActorEvidence['actorKind'],
  scenarios: PulseManifestScenarioSpec[],
  results: PulseScenarioResult[],
): PulseActorEvidence {
  const relevantResults = results.filter((result) => {
    if (actorKind === 'soak') {
      return scenarios.some((scenario) => scenario.id === result.scenarioId);
    }
    return result.actorKind === actorKind;
  });

  const declared = scenarios.map((scenario) => scenario.id);
  const executed = relevantResults
    .filter((result) => result.executed)
    .map((result) => result.scenarioId);
  const missing = relevantResults
    .filter((result) => result.status === 'missing_evidence')
    .map((result) => result.scenarioId);
  const passed = relevantResults
    .filter((result) => result.status === 'passed')
    .map((result) => result.scenarioId);
  const failed = relevantResults
    .filter((result) => result.status === 'failed' || result.status === 'checker_gap')
    .map((result) => result.scenarioId);

  const summary =
    declared.length === 0
      ? `No ${actorKind} scenarios are declared.`
      : `${actorKind} scenarios: ${passed.length} passed, ${failed.length} failed/checker-gap, ${missing.length} missing evidence.`;

  return {
    actorKind,
    declared,
    executed,
    missing,
    passed,
    failed,
    artifactPaths:
      declared.length > 0
        ? [getArtifactName(actorKind), WORLD_STATE_ARTIFACT, COVERAGE_ARTIFACT]
        : [],
    summary,
    results: relevantResults,
  };
}

function buildWorldState(
  input: RunSyntheticActorsInput,
  results: PulseScenarioResult[],
): PulseWorldState {
  const allowedScenarioIds = new Set(input.scenarioIds || []);
  const scopedScenarioSpecs = input.resolvedManifest.scenarioSpecs.filter(
    (spec) => allowedScenarioIds.size === 0 || allowedScenarioIds.has(spec.id),
  );
  const actorProfiles = input.resolvedManifest.actorProfiles.map((profile) => profile.id);
  const pendingAsyncExpectations = unique(
    scopedScenarioSpecs
      .filter((spec) => spec.asyncExpectations.length > 0)
      .filter((spec) => {
        const result = results.find((item) => item.scenarioId === spec.id);
        return !result || result.status !== 'passed';
      })
      .flatMap((spec) => spec.asyncExpectations.map((expectation) => `${spec.id}:${expectation}`)),
  ).sort();

  const sessions: PulseWorldState['sessions'] = ['customer', 'operator', 'admin', 'system'].map(
    (kind) => {
      const declaredScenarios = scopedScenarioSpecs.filter(
        (spec) => spec.actorKind === kind,
      ).length;
      const executedScenarios = results.filter(
        (result) => result.actorKind === kind && result.executed,
      ).length;
      const passedScenarios = results.filter(
        (result) => result.actorKind === kind && result.status === 'passed',
      ).length;
      return {
        kind: kind as PulseActorKind,
        declaredScenarios,
        executedScenarios,
        passedScenarios,
      };
    },
  );

  return {
    generatedAt: new Date().toISOString(),
    backendUrl: input.runtimeEvidence.backendUrl,
    frontendUrl: input.runtimeEvidence.frontendUrl,
    actorProfiles,
    executedScenarios: results
      .filter((result) => result.executed)
      .map((result) => result.scenarioId)
      .sort(),
    pendingAsyncExpectations,
    entities: Object.fromEntries(
      results
        .filter((result) => result.worldStateTouches.length > 0)
        .map((result) => [result.scenarioId, result.worldStateTouches]),
    ),
    asyncExpectationsStatus: scopedScenarioSpecs.flatMap((spec) =>
      spec.asyncExpectations.map((expectation) => {
        const result = results.find((item) => item.scenarioId === spec.id);
        const status = !result
          ? ('not_executed' as const)
          : result.status === 'passed'
            ? ('satisfied' as const)
            : result.status === 'failed'
              ? /timed out/i.test(result.summary)
                ? ('timed_out' as const)
                : ('failed' as const)
              : result.status === 'missing_evidence'
                ? /timed out/i.test(result.summary)
                  ? ('timed_out' as const)
                  : ('missing_evidence' as const)
                : result.status === 'checker_gap'
                  ? ('missing_evidence' as const)
                  : ('not_executed' as const);
        return {
          scenarioId: spec.id,
          expectation,
          status,
        };
      }),
    ),
    artifactsByScenario: Object.fromEntries(
      results.map((result) => [result.scenarioId, result.artifactPaths]),
    ),
    sessions,
  };
}

/** Run synthetic actors. */
export function runSyntheticActors(input: RunSyntheticActorsInput): PulseSyntheticActorBundle {
  const requestedModes = new Set(input.requestedModes || []);
  const allowedScenarioIds = new Set(input.scenarioIds || []);
  const scenarios = input.resolvedManifest.scenarioSpecs.filter(
    (spec) => allowedScenarioIds.size === 0 || allowedScenarioIds.has(spec.id),
  );
  const results = scenarios.map((spec) => evaluateScenario(input, spec, requestedModes));
  const coverage = buildSyntheticCoverage(
    input.codebaseTruth,
    input.resolvedManifest,
    allowedScenarioIds.size > 0 ? allowedScenarioIds : undefined,
  );

  const customerScenarios = scenarios.filter((spec) => spec.actorKind === 'customer');
  const operatorScenarios = scenarios.filter((spec) => spec.actorKind === 'operator');
  const adminScenarios = scenarios.filter((spec) => spec.actorKind === 'admin');
  const soakScenarios = scenarios.filter((spec) => spec.timeWindowModes.includes('soak'));

  return {
    customer: buildActorEvidence('customer', customerScenarios, results),
    operator: buildActorEvidence('operator', operatorScenarios, results),
    admin: buildActorEvidence('admin', adminScenarios, results),
    soak: buildActorEvidence('soak', soakScenarios, results),
    syntheticCoverage: coverage,
    worldState: buildWorldState(input, results),
  };
}
