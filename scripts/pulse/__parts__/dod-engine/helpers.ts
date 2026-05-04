import type { DoDGate, DoDRiskLevel, DoDOverallStatus } from '../../types.dod-engine';

export function nodePrefixesForKind(nodeIds: string[], prefix: string): string[] {
  const pattern = new RegExp(`^${prefix}:`);
  return nodeIds.filter((id) => pattern.test(id));
}

export function hasNodeKind(nodeIds: string[], prefix: string): boolean {
  return nodePrefixesForKind(nodeIds, prefix).length > 0;
}

export function containsObservedItems(items: readonly unknown[] | null | undefined): boolean {
  return Array.isArray(items) && items.length > zero();
}

export function containsReportedIssue(value: number | null | undefined): boolean {
  return typeof value === 'number' && value > zero();
}

export function lineNumberFromIndex(index: number): number {
  return index + Number(Number.isInteger(index));
}

export function zero(): number {
  return Number(false);
}

export function isElevatedLevel(riskLevel: DoDRiskLevel): boolean {
  return riskLevel === 'critical' || riskLevel === 'high';
}

export function allowsBlockingOutcome(riskLevel: DoDRiskLevel): boolean {
  return riskLevel !== 'low';
}

export function isApplicableRequirement(mode: string): boolean {
  return mode !== 'not_required';
}

export function isEmptyCollection(value: { length: number }): boolean {
  return value.length === zero();
}

export function isEmptyTotal(value: number): boolean {
  return value === zero();
}

export function isPassed(gate: DoDGate): boolean {
  return gate.status === 'pass';
}

export function isFailed(gate: DoDGate): boolean {
  return gate.status === 'fail';
}

export function isDoneStatus(status: DoDOverallStatus): boolean {
  return status === 'done';
}

export function isPartialStatus(status: DoDOverallStatus): boolean {
  return status === 'partial';
}

export function isBlockedStatus(status: DoDOverallStatus): boolean {
  return status === 'blocked';
}

export function isInferredTruthMode(truthMode: string): boolean {
  return truthMode === 'inferred';
}

export function certaintyFromStatus(status: DoDOverallStatus): number {
  const completeWeight = Number(Boolean(status));
  const partialWeight = 'partial'.length;
  const blockedWeight = 'done'.length - completeWeight;
  const denominator = partialWeight + blockedWeight;

  if (isDoneStatus(status)) {
    return completeWeight;
  }
  if (isPartialStatus(status)) {
    return partialWeight / denominator;
  }
  if (isBlockedStatus(status)) {
    return blockedWeight / denominator;
  }
  return Number(!status);
}

export function sumNumbers(values: number[]): number {
  return values.reduce((sum, value) => sum + value, zero());
}
