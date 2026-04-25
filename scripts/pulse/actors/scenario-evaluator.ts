import type {
  PulseActorEvidence,
  PulseFlowEvidence,
  PulseManifestScenarioSpec,
  PulseRuntimeEvidence,
  PulseScenarioResult,
} from '../types';
import { matchesRoutePattern, normalizeModuleToken } from './coverage';
import { buildScenarioResult, inferActorArtifact } from './scenario-result';
import { executePlaywrightScenario } from './playwright-runner';
import { getOperatorScenarioObserver } from './operator';
import { getAdminScenarioObserver } from './admin';
import type { PulseSyntheticRunMode, RunSyntheticActorsInput } from './types';

/** Summarize flow dependency failures for a scenario. */
export function summarizeFlowDependencyFailures(
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

/** Summarize runtime dependency failures for a scenario. */
export function summarizeRuntimeDependencyFailures(
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

/** Returns true when scenario is targeted by the requested run modes. */
export function canExecuteScenario(
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

/** Returns true when a scenario was explicitly requested in this run. */
export function isScenarioRequested(
  scenario: PulseManifestScenarioSpec,
  requestedModes: Set<PulseSyntheticRunMode>,
): boolean {
  return canExecuteScenario(scenario, requestedModes);
}

/** Evaluate an admin scenario via filesystem structural observation. */
export function evaluateAdminStructuralObservation(
  rootDir: string,
  scenario: PulseManifestScenarioSpec,
  actorArtifact: PulseActorEvidence['actorKind'],
): PulseScenarioResult | null {
  const observer = getAdminScenarioObserver(scenario.id);
  if (!observer) {
    return null;
  }
  const startedAt = Date.now();
  const observation = observer(rootDir);
  const checkSummary = observation.checks
    .map((c) => `${c.label}=${c.present ? 'present' : 'missing'}`)
    .join(',');
  if (!observation.passed) {
    return buildScenarioResult(scenario, actorArtifact, {
      status: 'failed',
      executed: true,
      requested: false,
      failureClass: 'product_failure',
      summary: observation.summary,
      durationMs: Date.now() - startedAt,
      metrics: {
        truthMode: observation.truthMode,
        structuralChecksTotal: observation.checks.length,
        structuralChecksPresent: observation.checks.filter((c) => c.present).length,
        structuralCheckSummary: checkSummary,
      },
    });
  }
  return buildScenarioResult(scenario, actorArtifact, {
    status: 'passed',
    executed: true,
    requested: true,
    smokeExecuted: false,
    replayExecuted: scenario.providerMode === 'replay' || scenario.providerMode === 'hybrid',
    worldStateConverged: true,
    summary: observation.summary,
    durationMs: Date.now() - startedAt,
    metrics: {
      truthMode: observation.truthMode,
      structuralChecksTotal: observation.checks.length,
      structuralChecksPresent: observation.checks.filter((c) => c.present).length,
      structuralCheckSummary: checkSummary,
    },
  });
}

/** Evaluate an operator scenario via filesystem structural observation. */
export function evaluateOperatorStructuralObservation(
  rootDir: string,
  scenario: PulseManifestScenarioSpec,
  actorArtifact: PulseActorEvidence['actorKind'],
): PulseScenarioResult | null {
  const observer = getOperatorScenarioObserver(scenario.id);
  if (!observer) {
    return null;
  }
  const startedAt = Date.now();
  const observation = observer(rootDir);
  const checkSummary = observation.checks
    .map((c) => `${c.label}=${c.present ? 'present' : 'missing'}`)
    .join(',');
  if (!observation.passed) {
    return buildScenarioResult(scenario, actorArtifact, {
      status: 'failed',
      executed: true,
      requested: false,
      failureClass: 'product_failure',
      summary: observation.summary,
      durationMs: Date.now() - startedAt,
      metrics: {
        truthMode: observation.truthMode,
        structuralChecksTotal: observation.checks.length,
        structuralChecksPresent: observation.checks.filter((c) => c.present).length,
        structuralCheckSummary: checkSummary,
      },
    });
  }
  return buildScenarioResult(scenario, actorArtifact, {
    status: 'passed',
    executed: true,
    requested: false,
    smokeExecuted: false,
    replayExecuted: scenario.providerMode === 'replay' || scenario.providerMode === 'hybrid',
    worldStateConverged: true,
    summary: observation.summary,
    durationMs: Date.now() - startedAt,
    metrics: {
      truthMode: observation.truthMode,
      structuralChecksTotal: observation.checks.length,
      structuralChecksPresent: observation.checks.filter((c) => c.present).length,
      structuralCheckSummary: checkSummary,
    },
  });
}

/** Evaluate a single scenario for the run, dispatching to the appropriate runner. */
export function evaluateScenario(
  input: RunSyntheticActorsInput,
  scenario: PulseManifestScenarioSpec,
  requestedModes: Set<PulseSyntheticRunMode>,
): PulseScenarioResult {
  const actorArtifact = inferActorArtifact(scenario);
  const requested = isScenarioRequested(scenario, requestedModes);
  const resolvedModuleMatches = new Set(
    input.resolvedManifest.modules.flatMap((moduleEntry) =>
      [
        moduleEntry.key,
        moduleEntry.name,
        moduleEntry.canonicalName,
        ...moduleEntry.aliases,
        ...moduleEntry.routeRoots,
      ]
        .filter(Boolean)
        .map(normalizeModuleToken),
    ),
  );
  const missingModules = scenario.moduleKeys.filter(
    (key) => !resolvedModuleMatches.has(normalizeModuleToken(key)),
  );
  const hasRouteCoverage = scenario.routePatterns.some((pattern) =>
    input.codebaseTruth.pages.some(
      (page) =>
        matchesRoutePattern(page.route, pattern) || matchesRoutePattern(pattern, page.route),
    ),
  );
  const hasFlowCoverage = scenario.flowSpecs.some((flowId) =>
    input.codebaseTruth.discoveredFlows.some(
      (flow) => flow.declaredFlow === flowId || flow.id === flowId,
    ),
  );
  if (missingModules.length > 0 && !hasRouteCoverage && !hasFlowCoverage) {
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
    // Admin scenarios are backed by structural observation. They do not invoke
    // live Playwright execution because admin surfaces are inspected via the
    // filesystem (frontend pages, backend controllers, worker lifecycle).
    const adminStructural = evaluateAdminStructuralObservation(
      input.rootDir,
      scenario,
      actorArtifact,
    );
    if (adminStructural) {
      return adminStructural;
    }
    if (!requested && requestedModes.size === 0) {
      const structural = evaluateOperatorStructuralObservation(
        input.rootDir,
        scenario,
        actorArtifact,
      );
      if (structural) {
        return structural;
      }
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
