import type {
  Break,
  PulseConvergenceUnit,
  PulseConvergenceUnitPriority,
  PulseConvergenceUnitStatus,
  PulseGateFailureClass,
} from '../../types';
import { CHECKER_GAP_TYPES, SECURITY_BREAK_TYPE_KERNEL_GRAMMAR } from '../../cert-constants';
import { isBlockingDynamicFinding, summarizeDynamicFindingEvents } from '../../finding-identity';

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
    unit.breakTypes,
    unit.artifactPaths,
    unit.relatedFiles,
    unit.validationArtifacts,
    unit.exitCriteria,
  ].reduce((total, values) => total + values.length, 0);
}

export function unitPressure(unit: PulseConvergenceUnit): number {
  let pressure = countUnitEvidence(unit);
  if (unit.status === 'open') {
    pressure += unit.exitCriteria.length || 1;
  }
  if (unit.evidenceMode === 'observed') {
    pressure += unit.artifactPaths.length || 1;
  }
  if (unit.failureClass === 'product_failure' || unit.failureClass === 'mixed') {
    pressure += unit.validationArtifacts.length || 1;
  }
  if (unit.riskLevel === 'critical') {
    pressure += unit.relatedFiles.length || unit.breakTypes.length || 1;
  }
  if (unit.productImpact === 'transformational') {
    pressure += unit.affectedCapabilityIds.length + unit.affectedFlowIds.length + 1;
  }
  if (unit.executionMode === 'observation_only') {
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
  return SECURITY_BREAK_TYPE_KERNEL_GRAMMAR.some((pattern) => pattern.test(item.type));
}

export function rankBreakTypes(breaks: Break[], limit?: number): string[] {
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

export function normalizeSearchToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function buildSearchTerms(
  scenarioId: string,
  moduleKeys: string[],
  routePatterns: string[],
  flowIds: string[],
): string[] {
  let routeTerms = routePatterns.flatMap((route) => route.split('/').filter(Boolean));
  let flowTerms = flowIds.flatMap((flowId) => splitWords(flowId));
  let scenarioTerms = splitWords(scenarioId);

  return uniqueStrings([...moduleKeys, ...routeTerms, ...flowTerms, ...scenarioTerms]).filter(
    (term) => normalizeSearchToken(term).length >= 3,
  );
}

export function findRelatedBreaks(
  breaks: Break[],
  scenarioId: string,
  moduleKeys: string[],
  routePatterns: string[],
  flowIds: string[],
): Break[] {
  let terms = buildSearchTerms(scenarioId, moduleKeys, routePatterns, flowIds);
  if (terms.length === 0) {
    return [];
  }

  return breaks.filter((item) => {
    let haystack = normalizeSearchToken(
      [item.file, item.description, item.detail, item.source || '', item.surface || ''].join(' '),
    );

    return terms.some((term) => haystack.includes(normalizeSearchToken(term)));
  });
}

export function determineFailureClass(
  classes: Array<PulseGateFailureClass | undefined>,
  hasPendingAsync: boolean,
): PulseConvergenceUnit['failureClass'] {
  let uniqueClasses = uniqueStrings(classes);
  if (uniqueClasses.length === 1) {
    return uniqueClasses[0] as PulseGateFailureClass;
  }
  if (uniqueClasses.length > 1) {
    return 'mixed';
  }
  if (hasPendingAsync) {
    return 'product_failure';
  }
  return 'unknown';
}

export function determineUnitStatus(
  failureClass: PulseConvergenceUnit['failureClass'],
): PulseConvergenceUnitStatus {
  return failureClass === 'missing_evidence' || failureClass === 'checker_gap' ? 'watch' : 'open';
}

export function normalizeFailureClass(
  failureClass: PulseGateFailureClass | null | undefined,
): PulseConvergenceUnit['failureClass'] {
  return failureClass ?? 'unknown';
}

export function normalizeOptionalState<T extends string>(
  value: T | null | undefined,
  fallback: T,
): T {
  return value ?? fallback;
}

export function countUnitState<T extends string>(
  units: PulseConvergenceUnit[],
  select: (unit: PulseConvergenceUnit) => T,
  expected: T,
): number {
  return units.filter((unit) => isSameState(select(unit), expected)).length;
}

export function normalizeConvergenceExecutionMode(
  mode: PulseConvergenceUnit['executionMode'],
): PulseConvergenceUnit['executionMode'] {
  if (mode === 'human_required' || mode === 'observation_only') {
    return 'observation_only';
  }
  return 'ai_safe';
}

export function normalizeConvergenceUnit(unit: PulseConvergenceUnit): PulseConvergenceUnit {
  let executionMode = normalizeConvergenceExecutionMode(unit.executionMode);
  if (executionMode === unit.executionMode) {
    return unit;
  }

  return {
    ...unit,
    status: 'watch',
    executionMode,
    failureClass: unit.failureClass === 'product_failure' ? 'missing_evidence' : unit.failureClass,
    exitCriteria: uniqueStrings([
      ...unit.exitCriteria,
      'PULSE captures validation evidence before converting this surface into governed autonomous execution.',
      'Rollback expectation is captured before mutation moves beyond observation.',
    ]),
  };
}
