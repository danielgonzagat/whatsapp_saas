import type { Break } from '../../types.manifest';
import type {
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
} from '../../types.convergence';
import { CHECKER_GAP_TYPES, SECURITY_FINDING_EVENT_KERNEL_GRAMMAR } from '../../cert-constants';
import { isBlockingDynamicFinding, summarizeDynamicFindingEvents } from '../../finding-identity';
import {
  observedCriticalRisk,
  observedObservationOnlyMode,
  observedOpenStatus,
  observedProductFailureClass,
  observedTransformationalImpact,
  observedTruthObservedMode,
} from '../builder-labels';

export function evidenceBatchSize(
  ...collections: Array<{ length: number } | null | undefined>
): number {
  let observedSize = collections.reduce((largest, collection) => {
    let currentSize = collection?.length ?? Number();
    return currentSize > largest ? currentSize : largest;
  }, Number());
  return Math.max(1, Math.ceil(Math.sqrt(Math.max(1, observedSize))));
}

export function takeEvidenceBatch<T>(values: T[], ...context: Array<{ length: number }>): T[] {
  return values.slice(0, evidenceBatchSize(values, ...context));
}

export function observedThreshold(values: number[]): number {
  let observedValues = values.filter((value) => Number.isFinite(value));
  if (!hasObservedItems(observedValues)) {
    return Number();
  }
  return observedValues.reduce((sum, value) => sum + value, Number()) / observedValues.length;
}

export function hasObservedItems(value: { length: number } | { size: number }): boolean {
  return 'length' in value ? Boolean(value.length) : Boolean(value.size);
}

export function lacksObservedItems(value: { length: number } | { size: number }): boolean {
  return !hasObservedItems(value);
}

export function isSameState<T extends string>(value: T, expected: T): boolean {
  return value === expected;
}

export function isDifferentState<T extends string>(value: T, expected: T): boolean {
  return value !== expected;
}

export function countUnitEvidence(unit: PulseConvergenceUnit): number {
  return [
    unit.gateNames,
    unit.scenarioIds,
    unit.routePatterns,
    unit.flowIds,
    unit.affectedCapabilityIds,
    unit.affectedFlowIds,
    unit.asyncExpectations,
    unit.findingEvents,
    unit.artifactPaths,
    unit.relatedFiles,
    unit.validationArtifacts,
    unit.exitCriteria,
  ].reduce((total, values) => total + values.length, 0);
}

export function unitPressure(unit: PulseConvergenceUnit): number {
  let pressure = countUnitEvidence(unit);
  if (unit.status === observedOpenStatus) {
    pressure += unit.exitCriteria.length || 1;
  }
  if (unit.evidenceMode === observedTruthObservedMode) {
    pressure += unit.artifactPaths.length || 1;
  }
  let unitMixedClass = 'mixed' as PulseConvergenceUnit['failureClass'];
  if (unit.failureClass === observedProductFailureClass || unit.failureClass === unitMixedClass) {
    pressure += unit.validationArtifacts.length || 1;
  }
  if (unit.riskLevel === observedCriticalRisk) {
    pressure += unit.relatedFiles.length || unit.findingEvents.length || 1;
  }
  if (unit.productImpact === observedTransformationalImpact) {
    pressure += unit.affectedCapabilityIds.length + unit.affectedFlowIds.length + 1;
  }
  if (unit.executionMode === observedObservationOnlyMode) {
    pressure -= unit.artifactPaths.length || 1;
  }
  return pressure;
}

export function compareByObservedPressure(
  left: PulseConvergenceUnit,
  right: PulseConvergenceUnit,
): number {
  let pressureDelta = unitPressure(right) - unitPressure(left);
  if (pressureDelta !== 0) {
    return pressureDelta;
  }
  let confidenceDelta = countUnitEvidence(right) - countUnitEvidence(left);
  if (confidenceDelta !== 0) {
    return confidenceDelta;
  }
  return left.title.localeCompare(right.title);
}

export function applyDerivedPriorities(units: PulseConvergenceUnit[]): PulseConvergenceUnit[] {
  let labels = uniqueStrings(units.map((unit) => unit.priority)) as PulseConvergenceUnitPriority[];
  let batchSize = evidenceBatchSize(units, labels);
  return units.map((unit, index) => {
    let labelIndex = Math.min(labels.length - 1, Math.floor(index / batchSize));
    return {
      ...unit,
      priority: labels[labelIndex] ?? unit.priority,
    };
  });
}

export function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(values.filter((value): value is string => Boolean(value && value.trim()))),
  ].sort();
}

export function compactText(value: string, max?: number): string {
  let maxLength = max ?? Math.max(Number(Boolean(value)), value.length);
  let compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= maxLength) {
    return compact;
  }
  return `${compact.slice(0, maxLength - Math.min(maxLength, 3))}...`;
}

export function splitWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s\-_]+/g)
    .filter(Boolean);
}

export function slugify(value: string): string {
  return splitWords(value)
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function humanize(value: string): string {
  return splitWords(value)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(' ');
}

export function isBlockingBreak(item: Break): boolean {
  return (
    (item.severity === 'critical' || item.severity === 'high') &&
    !CHECKER_GAP_TYPES.has(item.type) &&
    isBlockingDynamicFinding(item)
  );
}

export function isSecurityBreak(item: Break): boolean {
  return SECURITY_FINDING_EVENT_KERNEL_GRAMMAR.some((pattern) => pattern.test(item.type));
}

export function rankFindingEvents(breaks: Break[], limit?: number): string[] {
  return summarizeDynamicFindingEvents(breaks, limit ?? evidenceBatchSize(breaks));
}

export function rankFiles(breaks: Break[], limit?: number): string[] {
  let resolvedLimit = limit ?? evidenceBatchSize(breaks);
  let counts = new Map<string, number>();
  for (let item of breaks) {
    counts.set(item.file, (counts.get(item.file) ?? Number()) + Number(Boolean(item.file)));
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, resolvedLimit)
    .map(([file, count]) => (count > Number(Boolean(file)) ? `${file} (${count})` : file));
}
