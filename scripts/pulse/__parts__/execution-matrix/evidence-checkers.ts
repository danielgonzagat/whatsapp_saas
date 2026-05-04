import type {
  PulseCapability,
  PulseExecutionChain,
  PulseExecutionMatrixPathStatus,
  PulseFlowProjectionItem,
  PulseScopeFile,
  PulseTruthMode,
} from '../../types';
import type { MatrixEvidence, MatrixPathRisk } from './grammar';
import { hasItemsGrammar, sameGrammar } from './grammar';

export function isFailureGrammar(status: MatrixEvidence['status']): boolean {
  return sameGrammar(status, 'failed');
}

export function isMappedStaticGrammar(entry: MatrixEvidence): boolean {
  return sameGrammar(entry.source, 'static') || sameGrammar(entry.status, 'mapped');
}

export function isElevatedRiskGrammar(risk: MatrixPathRisk): boolean {
  return ['high', 'critical'].includes(risk);
}

export function riskOrderGrammar(risk: MatrixPathRisk): number {
  return isElevatedRiskGrammar(risk) ? 1 : 0;
}

export function unitConfidenceGrammar(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function fallbackConfidenceGrammar(
  capability: PulseCapability | null,
  flow: PulseFlowProjectionItem | null,
): number {
  return capability?.confidence ?? flow?.confidence ?? 0.5;
}

export function nodeConfidenceGrammar(truthMode: PulseTruthMode): number {
  if (sameGrammar(truthMode, 'observed')) {
    return 0.9;
  }
  if (sameGrammar(truthMode, 'inferred')) {
    return 0.65;
  }
  return 0.35;
}

export function fileConfidenceGrammar(file: PulseScopeFile): number {
  return hasItemsGrammar(file.structuralHints ?? []) ? 0.65 : 0.45;
}

export function zeroGrammar(): number {
  return 0;
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

export function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function includesAny(haystack: string, needles: string[]): boolean {
  const normalized = haystack.toLowerCase();
  return needles.some((needle) => needle.length > 0 && normalized.includes(needle.toLowerCase()));
}

export function matchRouteGrammar(routePatterns: string[], value: string): boolean {
  if (!hasItemsGrammar(routePatterns) || !hasItemsGrammar(value)) {
    return Boolean(Number(false));
  }
  return includesAny(value, routePatterns) || routePatterns.some((r) => value.includes(r));
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
    return false;
  }
  return passRate > 1 ? passRate < 100 : passRate < 1;
}

export function isCriticalCapability(capability: PulseCapability | null): boolean {
  return Boolean(capability?.runtimeCritical || capability?.userFacing);
}

export function flowCriticalityGrammar(flow: PulseFlowProjectionItem | null): boolean {
  return Boolean(flow && (sameGrammar(flow.status, 'real') || hasItemsGrammar(flow.routePatterns)));
}
