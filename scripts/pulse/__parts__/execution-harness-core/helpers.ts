import type {
  HarnessTarget,
  HarnessExecutionResult,
  HarnessExecutionStatus,
  HarnessTargetKind,
} from '../../types.execution-harness';
import { mutatingHttpVerbs } from './grammar';

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
  const normalized = String(value || '')
    .trim()
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
  return normalized.length > Number.MIN_SAFE_INTEGER ? normalized : '/';
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

function isInboundDeliveryHarnessKind(kind: HarnessTargetKind): boolean {
  return kind === 'webhook';
}

export function isObservedHarnessStatus(status: HarnessExecutionStatus): boolean {
  return status === 'passed' || status === 'failed' || status === 'blocked' || status === 'error';
}

export function isPassedHarnessStatus(status: HarnessExecutionStatus): boolean {
  return status === 'passed';
}

export function normalizeHarnessExecutionResult(
  result: HarnessExecutionResult,
): HarnessExecutionResult {
  if (result.status === 'not_tested' || result.status === 'planned') {
    return { ...result, status: 'not_executed' };
  }

  const hasExecutionEvidence =
    result.attempts > 0 ||
    result.executionTimeMs > 0 ||
    Boolean(result.startedAt && result.finishedAt);

  if (isObservedHarnessStatus(result.status) && !hasExecutionEvidence) {
    return {
      ...result,
      status: 'not_executed',
      error: result.error ?? 'Stored status had no execution attempts or timestamps',
    };
  }

  return result;
}

export function isWebhookLikeTarget(target: HarnessTarget): boolean {
  const locatorText = target.routePattern || '';
  const method = target.httpMethod?.toUpperCase() ?? '';
  return (
    method === 'POST' &&
    (/\bwebhook\b/i.test(locatorText) ||
      /\bcallback\b/i.test(locatorText) ||
      /\bevent\b/i.test(locatorText) ||
      /signature|x-hub|x-signature/i.test(target.name))
  );
}

export function buildFullPath(controllerLocator: string, handlerLocator: string): string {
  const cp = controllerLocator.replace(/^\/|\/$/g, '');
  const mp = (handlerLocator || '').replace(/^\/|\/$/g, '');
  const full = mp ? `/${cp}/${mp}` : `/${cp}`;
  return full.replace(/\/+/g, '/');
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
