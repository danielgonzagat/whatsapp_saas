import type {
  HarnessTarget,
  HarnessTargetKind,
  HarnessExecutionStatus,
  HarnessExecutionResult,
  ExecutionFeasibility,
} from '../../types.execution-harness';
import {
  deriveZeroValue,
  deriveUnitValue,
  discoverHarnessExecutionFeasibilityLabels,
  discoverHarnessExecutionStatusLabels,
  discoverHarnessTargetKindLabels,
  discoverPropertyPassedStatusFromTypeEvidence,
  discoverPropertyUnexecutedStatusFromExecutionEvidence,
  discoverRouteSeparatorFromRuntime,
} from '../../dynamic-reality-kernel';
import {
  EXTERNAL_TOKENS,
  mutatingHttpVerbs,
  PASSED_STATUSES,
  UNEXECUTED_STATUSES,
} from './grammar';

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

export function camelToKebab(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function normalizeDiscoveredLocator(value: string): string {
  const normSep = discoverRouteSeparatorFromRuntime();
  const normalized = String(value || '')
    .trim()
    .replace(/\/+/g, normSep)
    .replace(/\/$/, '');
  return normalized.length > deriveZeroValue() ? normalized : normSep;
}

export function parseRouteParameters(locatorText: string): string[] {
  const params: string[] = [];
  const routeParameterGrammar = /(?::|\{)([A-Za-z_]\w*)\}?/g;
  let match = routeParameterGrammar.exec(locatorText);

  while (match) {
    params.push(match[1]);
    match = routeParameterGrammar.exec(locatorText);
  }

  return unique(params);
}

export function hasPersistenceDependency(target: HarnessTarget): boolean {
  return target.dependencies.some((dependency) =>
    /prisma|database|repository|model/i.test(dependency),
  );
}

export function isCriticalHarnessTarget(target: HarnessTarget): boolean {
  return requiresGovernedHarnessEvidence(target);
}

function requiresGovernedHarnessEvidence(target: HarnessTarget): boolean {
  const method = target.httpMethod?.toUpperCase() ?? null;
  return (
    isInboundDeliveryHarnessKind(target.kind) ||
    target.requiresAuth ||
    target.requiresTenant ||
    hasPersistenceDependency(target) ||
    Boolean(method && mutatingHttpVerbs().has(method))
  );
}

const INBOUND_KIND_LABELS = new Set(
  [...discoverHarnessTargetKindLabels()].filter((k) => EXTERNAL_TOKENS.some((t) => k.includes(t))),
);
function isInboundDeliveryHarnessKind(kind: HarnessTargetKind): boolean {
  return INBOUND_KIND_LABELS.has(kind);
}

export const ALL_EXECUTION_STATUS_LABELS = discoverHarnessExecutionStatusLabels();
export const PLANNED_STATUS = [...UNEXECUTED_STATUSES].sort((a, b) => a.length - b.length)[
  deriveZeroValue()
];

const EXECUTED_NON_PASSED_STATUSES = [...ALL_EXECUTION_STATUS_LABELS]
  .filter((s) => !PASSED_STATUSES.has(s) && !UNEXECUTED_STATUSES.has(s))
  .sort((a, b) => a.length - b.length || a.localeCompare(b));
export const FAILED_HARNESS_STATUS = EXECUTED_NON_PASSED_STATUSES[
  deriveUnitValue()
] as HarnessExecutionStatus;
export const BLOCKED_HARNESS_STATUS = EXECUTED_NON_PASSED_STATUSES[
  deriveUnitValue() + deriveUnitValue()
] as HarnessExecutionStatus;

const FEASIBILITY_LABELS = [...discoverHarnessExecutionFeasibilityLabels()].sort(
  (a, b) => a.length - b.length,
);
export const EXECUTABLE_FEASIBILITY = FEASIBILITY_LABELS[deriveZeroValue()] as ExecutionFeasibility;
export const NEEDS_STAGING_FEASIBILITY = FEASIBILITY_LABELS[
  deriveUnitValue()
] as ExecutionFeasibility;
export const CANNOT_EXECUTE_FEASIBILITY = FEASIBILITY_LABELS[
  FEASIBILITY_LABELS.length - deriveUnitValue()
] as ExecutionFeasibility;

const OBSERVED_HARNESS_STATUSES = new Set(
  [...ALL_EXECUTION_STATUS_LABELS].filter(
    (s) =>
      PASSED_STATUSES.has(s) ||
      UNEXECUTED_STATUSES.has(s) ||
      (s !== [...PASSED_STATUSES].find(() => false) &&
        !UNEXECUTED_STATUSES.has(s) &&
        ALL_EXECUTION_STATUS_LABELS.has(s)),
  ),
);
export function isObservedHarnessStatus(status: HarnessExecutionStatus): boolean {
  return OBSERVED_HARNESS_STATUSES.has(status);
}

export function isPassedHarnessStatus(status: HarnessExecutionStatus): boolean {
  return PASSED_STATUSES.has(status);
}

export function normalizeHarnessExecutionResult(
  result: HarnessExecutionResult,
): HarnessExecutionResult {
  const canonicalUnexecuted = [...UNEXECUTED_STATUSES].find((s) =>
    ALL_EXECUTION_STATUS_LABELS.has(s),
  );
  const fallbackUnexecuted = [...UNEXECUTED_STATUSES][0];
  if (
    UNEXECUTED_STATUSES.has(result.status) ||
    (ALL_EXECUTION_STATUS_LABELS.has(result.status) &&
      !PASSED_STATUSES.has(result.status) &&
      !OBSERVED_HARNESS_STATUSES.has(result.status))
  ) {
    return {
      ...result,
      status: (canonicalUnexecuted ?? fallbackUnexecuted) as HarnessExecutionStatus,
    };
  }

  const hasExecutionEvidence =
    result.attempts > 0 ||
    result.executionTimeMs > 0 ||
    Boolean(result.startedAt && result.finishedAt);

  const notExecuted = canonicalUnexecuted ?? fallbackUnexecuted;
  if (isObservedHarnessStatus(result.status) && !hasExecutionEvidence) {
    return {
      ...result,
      status: notExecuted as HarnessExecutionStatus,
      error: result.error ?? 'Stored status had no execution attempts or timestamps',
    };
  }

  return result;
}

export function isWebhookLikeTarget(target: HarnessTarget): boolean {
  const locatorText = target.routePattern || '';
  const method = target.httpMethod?.toUpperCase() ?? '';
  const hasExternalToken = EXTERNAL_TOKENS.some((token) =>
    new RegExp(`\\b${token}\\b`, 'i').test(locatorText),
  );
  return (
    method === 'POST' && (hasExternalToken || /signature|x-hub|x-signature/i.test(target.name))
  );
}

export function buildFullPath(controllerLocator: string, handlerLocator: string): string {
  const sep = discoverRouteSeparatorFromRuntime();
  const cp = controllerLocator.replace(/^\/|\/$/g, '');
  const mp = (handlerLocator || '').replace(/^\/|\/$/g, '');
  const full = mp ? `${sep}${cp}${sep}${mp}` : `${sep}${cp}`;
  return full.replace(/\/+/g, sep);
}

export function formatTimestamp(): string {
  return new Date().toISOString();
}

export function measureParenBalance(value: string): number {
  let delta = 0;
  for (const ch of value) {
    if (ch === '(') {
      delta++;
    } else if (ch === ')') {
      delta--;
    }
  }
  return delta;
}
