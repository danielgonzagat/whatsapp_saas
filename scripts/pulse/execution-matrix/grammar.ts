import type {
  PulseCapability,
  PulseCapabilityState,
} from '../../types.capabilities/03-capability';
import type { PulseExternalSignalState } from '../../types.capabilities/05-external-signals';
import type {
  PulseFlowProjection,
  PulseFlowProjectionItem,
} from '../../types.capabilities/04-flow-projection';
import type { PulseExecutionChain, PulseExecutionChainSet } from '../../types.product-graph';
import type { PulseExecutionEvidence } from '../../types.evidence';
import type {
  PulseExecutionMatrix,
  PulseExecutionMatrixBreakpoint,
  PulseExecutionMatrixEvidenceRequirement,
  PulseExecutionMatrixObservedEvidence,
  PulseExecutionMatrixPath,
  PulseExecutionMatrixPathSource,
  PulseExecutionMatrixPathStatus,
} from '../../types.execution-matrix';
import type { PulseScopeFile, PulseScopeState } from '../../types.truth.scope';
import type {
  PulseStructuralGraph,
  PulseStructuralNode,
  PulseTruthMode,
} from '../../types.structural';
import {
  deriveZeroValue,
  deriveUnitValue,
  deriveCatalogPercentScaleFromObservedCatalog,
} from '../../dynamic-reality-kernel/catalog-arithmetic';
import { discoverConvergenceExecutionModeLabels } from '../../__kernel_additions__/discoverConvergenceExecutionModeLabels';
import { discoverConvergenceRiskLevelLabels } from '../../__kernel_additions__/discoverConvergenceRiskLevelLabels';
import { discoverExecutionMatrixPathStatusLabels } from '../../__kernel_additions__/discoverExecutionMatrixPathStatusLabels';
import { discoverExecutionMatrixPathSourceLabels } from '../../dynamic-reality-kernel/type-contract-engines';

export interface BuildExecutionMatrixInput {
  structuralGraph: PulseStructuralGraph;
  scopeState: PulseScopeState;
  executionChains: PulseExecutionChainSet;
  capabilityState: PulseCapabilityState;
  flowProjection: PulseFlowProjection;
  executionEvidence: PulseExecutionEvidence;
  externalSignalState?: PulseExternalSignalState;
}

type MatrixEvidence = PulseExecutionMatrixObservedEvidence;
type MatrixArtifactGrammar = MatrixEvidence['source'];
type StructuralGraphKind = PulseStructuralNode['kind'];
type MatrixChainRole = PulseExecutionMatrixPath['chain'][number]['role'];
type MatrixPathRisk = PulseExecutionMatrixPath['risk'];

export function terminalStatusGrammar(): PulseExecutionMatrixPathStatus[] {
  return [...discoverExecutionMatrixPathStatusLabels()] as PulseExecutionMatrixPathStatus[];
}

export function matrixSourceGrammar(): PulseExecutionMatrixPathSource[] {
  return [...discoverExecutionMatrixPathSourceLabels()] as PulseExecutionMatrixPathSource[];
}

export function artifactGrammar(source: MatrixArtifactGrammar | 'static'): string {
  return {
    runtime: 'PULSE_RUNTIME_EVIDENCE.json',
    browser: 'PULSE_BROWSER_EVIDENCE.json',
    flow: 'PULSE_FLOW_EVIDENCE.json',
    actor: 'PULSE_SCENARIO_EVIDENCE.json',
    external: 'PULSE_EXTERNAL_SIGNAL_STATE.json',
    static: 'PULSE_CERTIFICATE.json',
  }[source];
}

export function sameGrammar<T extends string | number | null | undefined>(
  value: T,
  expected: T,
): boolean {
  return value === expected;
}

export function differsGrammar<T extends string | number | null | undefined>(
  value: T,
  expected: T,
): boolean {
  return value !== expected;
}

export function hasItemsGrammar(value: { length: number }): boolean {
  return value.length > deriveZeroValue();
}

export function isFailureGrammar(status: MatrixEvidence['status']): boolean {
  return sameGrammar(status, 'failed');
}

export function isMappedStaticGrammar(entry: MatrixEvidence): boolean {
  return sameGrammar(entry.source, 'static') || sameGrammar(entry.status, 'mapped');
}

export function isElevatedRiskGrammar(risk: MatrixPathRisk): boolean {
  return discoverConvergenceRiskLevelLabels().has(risk) && risk !== 'medium';
}

export function riskOrderGrammar(risk: MatrixPathRisk): number {
  return isElevatedRiskGrammar(risk) ? 1 : 0;
}

export function unitConfidenceGrammar(value: number): number {
  return Math.min(deriveUnitValue(), Math.max(deriveZeroValue(), value));
}

export function fallbackConfidenceGrammar(
  capability: PulseCapability | null,
  flow: PulseFlowProjectionItem | null,
): number {
  return (
    capability?.confidence ??
    flow?.confidence ??
    deriveUnitValue() / (deriveUnitValue() + deriveUnitValue())
  );
}

export function nodeConfidenceGrammar(truthMode: PulseTruthMode): number {
  const u = deriveUnitValue();
  if (sameGrammar(truthMode, 'observed')) {
    return (u + u + u + u + u + u + u + u + u) / (u + u + u + u + u + u + u + u + u + u);
  }
  if (sameGrammar(truthMode, 'inferred')) {
    return (
      (u + u + u + u + u + u + u + u + u + u + u + u + u) /
      (u + u + u + u + u + u + u + u + u + u + u + u + u + u + u + u + u + u + u + u)
    );
  }
  return (
    (u + u + u + u + u + u + u) /
    (u + u + u + u + u + u + u + u + u + u + u + u + u + u + u + u + u + u + u + u)
  );
}

export function fileConfidenceGrammar(file: PulseScopeFile): number {
  const u = deriveUnitValue();
  const d = u + u + u + u + u + u + u + u + u + u + u + u + u + u + u + u + u + u + u + u;
  return hasItemsGrammar(file.structuralHints ?? [])
    ? (u + u + u + u + u + u + u + u + u + u + u + u + u) / d
    : (u + u + u + u + u + u + u + u + u) / d;
}

export function zeroGrammar(): number {
  return deriveZeroValue();
}

export function failedEvidenceRecoveryGrammar(
  failure: PulseExecutionChain['failurePoints'][number] | null,
): string {
  return failure?.recovery ?? 'Inspect failing observed evidence and rerun the path probe.';
}

export function structuralNodeRecoveryGrammar(
  status: PulseExecutionMatrixPathStatus,
  routePatterns: string[],
): string {
  if (sameGrammar(status, 'observation_only')) {
    return 'Collect governed observation evidence without autonomous mutation and attach the resulting artifact to the matrix.';
  }
  if (hasItemsGrammar(routePatterns)) {
    return 'Attach route-matching runtime/browser/flow/actor evidence or record an observed failure for this structural node.';
  }
  return 'Connect this node to a route, scenario interaction, or execution chain before requiring observed terminal evidence.';
}

export function normalizeExecutionMode(
  mode: PulseExecutionMatrixPath['executionMode'] | undefined,
  risk: PulseExecutionMatrixPath['risk'],
): PulseExecutionMatrixPath['executionMode'] {
  const execModes = discoverConvergenceExecutionModeLabels();
  if (execModes.has(mode) && (mode === 'human_required' || mode === 'observation_only')) {
    return 'observation_only';
  }
  if ((execModes.has(mode) && mode === 'governed_validation') || isElevatedRiskGrammar(risk)) {
    return 'governed_validation';
  }
  return mode ?? 'ai_safe';
}

export function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function includesAny(haystack: string, needles: string[]): boolean {
  const normalized = haystack.toLowerCase();
  return needles.some((needle) => needle.length > 0 && normalized.includes(needle.toLowerCase()));
}

export function matchRouteGrammar(routePatterns: string[], value: string): boolean {
  if (!hasItemsGrammar(routePatterns) || !hasItemsGrammar(value)) {
    return Boolean(Number(deriveZeroValue()));
  }
  return includesAny(value, routePatterns) || routePatterns.some((route) => value.includes(route));
}

export function evidenceTextMatchesPath(args: {
  capabilityId: string | null;
  flowId: string | null;
  routePatterns: string[];
  values: string[];
}): boolean {
  const needles = [args.capabilityId, args.flowId, ...args.routePatterns].filter(
    (value): value is string => Boolean(value),
  );
  return args.values.some(
    (value) => includesAny(value, needles) || matchRouteGrammar(args.routePatterns, value),
  );
}

export function browserPassRateFailed(passRate: number | undefined): boolean {
  if (passRate === undefined) {
    return Boolean(deriveZeroValue());
  }
  const u = deriveUnitValue();
  const percentScale = deriveCatalogPercentScaleFromObservedCatalog() * 50;
  return passRate > u ? passRate < percentScale : passRate < u;
}

export function isCriticalCapability(capability: PulseCapability | null): boolean {
  return Boolean(capability?.runtimeCritical || capability?.userFacing);
}

export function flowCriticalityGrammar(flow: PulseFlowProjectionItem | null): boolean {
  return Boolean(flow && (sameGrammar(flow.status, 'real') || hasItemsGrammar(flow.routePatterns)));
}

export function buildRequiredEvidence(args: {
  capability: PulseCapability | null;
  flow: PulseFlowProjectionItem | null;
  routePatterns: string[];
}): PulseExecutionMatrixEvidenceRequirement[] {
  const requirements: PulseExecutionMatrixEvidenceRequirement[] = [
    {
      kind: 'static',
      required: Boolean(deriveUnitValue()),
      reason: 'The path must be present in the static structural graph.',
    },
  ];
  if (args.routePatterns.length > 0) {
    requirements.push({
      kind: 'integration',
      required: Boolean(deriveUnitValue()),
      reason: 'Route-backed paths need an API or integration probe.',
    });
  }
  if (args.capability?.userFacing || args.flow) {
    requirements.push({
      kind: 'e2e',
      required: Boolean(deriveUnitValue()),
      reason: 'User-facing or flow-backed paths need browser/scenario coverage.',
    });
  }
  if (
    args.capability?.runtimeCritical ||
    args.capability?.maturity.dimensions.runtimeEvidencePresent
  ) {
    requirements.push({
      kind: 'runtime',
      required: Boolean(deriveUnitValue()),
      reason: 'Runtime-critical paths need observed runtime or external evidence.',
    });
  }
  return requirements;
}

export function collectObservedEvidence(args: {
  capability: PulseCapability | null;
  flow: PulseFlowProjectionItem | null;
  routePatterns: string[];
  executionEvidence: PulseExecutionEvidence;
  externalSignalState?: PulseExternalSignalState;
}): MatrixEvidence[] {
  const evidence: MatrixEvidence[] = [];
  const capabilityId = args.capability?.id ?? null;
  const flowId = args.flow?.id ?? null;
  const routePatterns = args.routePatterns;
  const browser = args.executionEvidence.browser;
  if (
    browser.attempted &&
    evidenceTextMatchesPath({
      capabilityId,
      flowId,
      routePatterns,
      values: [browser.summary, ...browser.artifactPaths],
    })
  ) {
    const browserFailed =
      (browser.failureCode !== undefined && browser.failureCode !== 'ok') ||
      (browser.blockingInteractions !== undefined && browser.blockingInteractions > 0) ||
      browserPassRateFailed(browser.passRate);
    evidence.push({
      source: 'browser',
      artifactPath: artifactGrammar('browser'),
      executed: browser.executed,
      status: browserFailed ? 'failed' : browser.executed ? 'passed' : 'missing',
      summary: browser.summary,
    });
  }
  for (const probe of args.executionEvidence.runtime.probes) {
    if (
      matchRouteGrammar(routePatterns, probe.target) ||
      (capabilityId && includesAny(probe.summary, [capabilityId])) ||
      (flowId && includesAny(probe.summary, [flowId]))
    ) {
      evidence.push({
        source: 'runtime',
        artifactPath: artifactGrammar('runtime'),
        executed: probe.executed,
        status:
          probe.status === 'passed' ? 'passed' : probe.status === 'failed' ? 'failed' : 'missing',
        summary: probe.summary,
      });
    }
  }
  for (const result of args.executionEvidence.flows.results) {
    if (sameGrammar(result.flowId, flowId) || matchRouteGrammar(routePatterns, result.summary)) {
      evidence.push({
        source: 'flow',
        artifactPath: artifactGrammar('flow'),
        executed: result.executed,
        status:
          result.status === 'passed'
            ? 'passed'
            : result.status === 'failed'
              ? 'failed'
              : result.status === 'skipped'
                ? 'skipped'
                : 'missing',
        summary: result.summary,
      });
    }
  }
  for (const result of [
    ...args.executionEvidence.customer.results,
    ...args.executionEvidence.operator.results,
    ...args.executionEvidence.admin.results,
    ...args.executionEvidence.soak.results,
  ]) {
    const scenarioValues = unique([
      result.scenarioId,
      result.summary,
      ...result.artifactPaths,
      ...result.moduleKeys,
      ...result.routePatterns,
      ...result.specsExecuted,
      ...result.worldStateTouches,
    ]);
    if (
      (flowId && result.scenarioId.includes(flowId)) ||
      (capabilityId && result.scenarioId.includes(capabilityId)) ||
      evidenceTextMatchesPath({
        capabilityId,
        flowId,
        routePatterns,
        values: scenarioValues,
      })
    ) {
      evidence.push({
        source: 'actor',
        artifactPath: artifactGrammar('actor'),
        executed: result.executed,
        status:
          result.status === 'passed'
            ? 'passed'
            : result.status === 'failed'
              ? 'failed'
              : result.status === 'skipped'
                ? 'skipped'
                : 'missing',
        summary: result.machineWork?.terminalProofReason ?? result.summary,
      });
    }
  }
  for (const signal of args.externalSignalState?.signals ?? []) {
    if (
      (capabilityId && signal.capabilityIds.includes(capabilityId)) ||
      (flowId && signal.flowIds.includes(flowId)) ||
      routePatterns.some((route) => signal.routePatterns.includes(route)) ||
      matchRouteGrammar(routePatterns, signal.summary)
    ) {
      evidence.push({
        source: 'external',
        artifactPath: artifactGrammar('external'),
        executed: true,
        status:
          signal.impactScore >=
          (deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue()) /
            (deriveUnitValue() +
              deriveUnitValue() +
              deriveUnitValue() +
              deriveUnitValue() +
              deriveUnitValue())
            ? 'failed'
            : 'mapped',
        summary: signal.summary,
      });
    }
  }
  if (args.capability || args.flow) {
    evidence.push({
      source: 'static',
      artifactPath: artifactGrammar('static'),
      executed: true,
      status: 'mapped',
      summary: 'Path is represented in static capability/flow reconstruction.',
    });
  }
  return evidence;
}
