import type {
  PulseActorEvidence,
  PulseExecutionEvidence,
  PulseFlowResult,
  PulseResolvedManifest,
  PulseRuntimeProbe,
} from './types';
import { deriveStructuralFamilies, familiesOverlap } from './structural-family';

export interface PulseObservationFootprint {
  routePatterns: string[];
  routeFamilies: string[];
  moduleKeys: string[];
  moduleFamilies: string[];
  flowIds: string[];
  scenarioIds: string[];
  probeIds: string[];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function executedFlowResults(evidence?: Partial<PulseExecutionEvidence>): PulseFlowResult[] {
  return (evidence?.flows?.results || []).filter(
    (result) => result.executed || result.status === 'failed',
  );
}

function actorResults(evidence?: Partial<PulseExecutionEvidence>) {
  return [
    ...(evidence?.customer?.results || []),
    ...(evidence?.operator?.results || []),
    ...(evidence?.admin?.results || []),
    ...(evidence?.soak?.results || []),
  ];
}

function executedScenarioResults(
  evidence?: Partial<PulseExecutionEvidence>,
): Array<PulseActorEvidence['results'][number]> {
  return actorResults(evidence).filter((result) => result.executed || result.status === 'failed');
}

function observedProbes(evidence?: Partial<PulseExecutionEvidence>): PulseRuntimeProbe[] {
  return (evidence?.runtime?.probes || []).filter(
    (probe) => probe.executed || probe.status === 'passed' || probe.status === 'failed',
  );
}

function probeRoutePatterns(probe: PulseRuntimeProbe): string[] {
  const inferred = new Set<string>();

  if (probe.probeId === 'backend-health') {
    inferred.add('/health/system');
    inferred.add('/health');
  }
  if (probe.probeId === 'auth-session') {
    inferred.add('/auth/login');
    inferred.add('/workspace/me');
    inferred.add('/auth/me');
  }
  if (probe.probeId === 'frontend-reachability') {
    inferred.add('/');
  }

  const target = String(probe.target || '').trim();
  if (!target) {
    return [...inferred];
  }

  if (target.startsWith('/')) {
    inferred.add(target);
    return [...inferred];
  }

  try {
    const parsed = new URL(target);
    if (parsed.pathname) {
      inferred.add(parsed.pathname);
    }
  } catch {
    // Ignore non-URL targets such as DB sources.
  }

  return [...inferred];
}

export function buildObservationFootprint(
  resolvedManifest: PulseResolvedManifest,
  executionEvidence?: Partial<PulseExecutionEvidence>,
): PulseObservationFootprint {
  const flowResults = executedFlowResults(executionEvidence);
  const scenarioResults = executedScenarioResults(executionEvidence);
  const probes = observedProbes(executionEvidence);
  const observedFlowIds = unique(flowResults.map((result) => result.flowId).filter(Boolean));
  const flowLinkedScenarios = resolvedManifest.scenarioSpecs.filter((spec) =>
    spec.flowSpecs.some((flowId) => observedFlowIds.includes(flowId)),
  );
  const routePatterns = unique([
    ...scenarioResults.flatMap((result) => result.routePatterns),
    ...flowLinkedScenarios.flatMap((scenario) => scenario.routePatterns),
    ...probes.flatMap((probe) => probeRoutePatterns(probe)),
  ]).filter(Boolean);
  const moduleKeys = unique([
    ...scenarioResults.flatMap((result) => result.moduleKeys),
    ...flowLinkedScenarios.flatMap((scenario) => scenario.moduleKeys),
  ]).filter(Boolean);

  return {
    routePatterns,
    routeFamilies: deriveStructuralFamilies(routePatterns),
    moduleKeys,
    moduleFamilies: deriveStructuralFamilies(moduleKeys),
    flowIds: observedFlowIds,
    scenarioIds: unique(scenarioResults.map((result) => result.scenarioId).filter(Boolean)),
    probeIds: unique(probes.map((probe) => probe.probeId).filter(Boolean)),
  };
}

export function footprintMatchesFamilies(
  families: string[],
  footprint: PulseObservationFootprint,
): boolean {
  if (families.length === 0) {
    return false;
  }
  return (
    familiesOverlap(families, footprint.routeFamilies) ||
    familiesOverlap(families, footprint.moduleFamilies)
  );
}
