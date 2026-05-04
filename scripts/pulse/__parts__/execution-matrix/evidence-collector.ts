import type {
  PulseCapability,
  PulseExecutionEvidence,
  PulseExecutionMatrixEvidenceRequirement,
  PulseExternalSignalState,
  PulseFlowProjectionItem,
} from '../../types';
import type { MatrixEvidence } from './grammar';
import { artifactGrammar, sameGrammar } from './grammar';
import {
  browserPassRateFailed,
  evidenceTextMatchesPath,
  includesAny,
  matchRouteGrammar,
  unique,
} from './evidence-checkers';

export function buildRequiredEvidence(args: {
  capability: PulseCapability | null;
  flow: PulseFlowProjectionItem | null;
  routePatterns: string[];
}): PulseExecutionMatrixEvidenceRequirement[] {
  const requirements: PulseExecutionMatrixEvidenceRequirement[] = [
    {
      kind: 'static',
      required: true,
      reason: 'The path must be present in the static structural graph.',
    },
  ];
  if (args.routePatterns.length > 0) {
    requirements.push({
      kind: 'integration',
      required: true,
      reason: 'Route-backed paths need an API or integration probe.',
    });
  }
  if (args.capability?.userFacing || args.flow) {
    requirements.push({
      kind: 'e2e',
      required: true,
      reason: 'User-facing or flow-backed paths need browser/scenario coverage.',
    });
  }
  if (
    args.capability?.runtimeCritical ||
    args.capability?.maturity.dimensions.runtimeEvidencePresent
  ) {
    requirements.push({
      kind: 'runtime',
      required: true,
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
        status: signal.impactScore >= 0.8 ? 'failed' : 'mapped',
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
