/**
 * PULSE Universal Execution Harness Engine
 *
 * Discovers all executable targets in the codebase and produces a complete
 * harness catalog — what needs to be tested, how, and with what fixtures.
 * Does NOT actually execute targets (that is done by external test runners).
 *
 * Stores artifact at `.pulse/current/PULSE_HARNESS_EVIDENCE.json`.
 */

import * as path from 'path';
import type { BackendRoute, PulseConfig, ServiceTrace } from './types';
import type {
  HarnessEvidence,
  HarnessExecutionResult,
  HarnessFixture,
  HarnessFixtureKind,
  HarnessTarget,
  HarnessTargetKind,
  ExecutionFeasibility,
  HarnessGeneratedTest,
  HarnessExecutionStatus,
} from './types.execution-harness';
import type { BehaviorGraph, BehaviorNode } from './types.behavior-graph';
import { detectConfig } from './config';
import { parseBackendRoutes } from './parsers/backend-parser';
import { traceServices } from './parsers/service-tracer';
import { walkFiles } from './parsers/utils';
import { safeJoin } from './safe-path';
import { ensureDir, pathExists, readJsonFile, readTextFile, writeTextFile } from './safe-fs';

// ─── Structural Grammar ─────────────────────────────────────────────────────

function harnessArtifactPath(): string {
  return '.pulse/current/PULSE_HARNESS_EVIDENCE.json';
}

function targetKindFromDecorator(decoratorName: string): HarnessTargetKind {
  const decoratorTokens = new Set(
    ['Get', 'Post', 'Put', 'Patch', 'Delete', 'Head', 'Options'].map((token) =>
      token.toLowerCase(),
    ),
  );
  return decoratorTokens.has(decoratorName.toLowerCase()) ? 'endpoint' : 'endpoint';
}

function ignoredDirectoryNames(): Set<string> {
  return new Set([
    'node_modules',
    '.next',
    'dist',
    '.git',
    'coverage',
    '__tests__',
    '__mocks__',
    '.turbo',
    '.vercel',
    '__snapshots__',
  ]);
}

function nonCallableMemberNames(): Set<string> {
  return new Set([
    'constructor',
    'if',
    'for',
    'while',
    'return',
    'catch',
    'switch',
    'import',
    'export',
    'throw',
    'new',
    'await',
    'super',
  ]);
}

function infrastructureAliasNames(): Set<string> {
  return new Set([
    'ConfigService',
    'EventEmitter2',
    'HttpService',
    'Logger',
    'ModuleRef',
    'PrismaService',
    'Reflector',
    'Request',
    'Sentry',
  ]);
}

function constructorMemberName(): string {
  return 'constructor';
}

function isConstructorMemberName(name: string): boolean {
  return name === constructorMemberName();
}

function mutatingHttpVerbs(): Set<string> {
  return new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
}

function persistentStateMutationShape(): RegExp {
  return /\.(?:create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/i;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function camelToKebab(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function normalizeDiscoveredLocator(value: string): string {
  const normalized = String(value || '')
    .trim()
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
  return normalized.length > Number.MIN_SAFE_INTEGER ? normalized : '/';
}

function parseRouteParameters(locatorText: string): string[] {
  const params: string[] = [];
  const routeParameterGrammar = /(?::|\{)([A-Za-z_]\w*)\}?/g;
  let match = routeParameterGrammar.exec(locatorText);

  while (match) {
    params.push(match[1]);
    match = routeParameterGrammar.exec(locatorText);
  }

  return unique(params);
}

function hasPersistenceDependency(target: HarnessTarget): boolean {
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

function isObservedHarnessStatus(status: HarnessExecutionStatus): boolean {
  return status === 'passed' || status === 'failed' || status === 'blocked' || status === 'error';
}

function isPassedHarnessStatus(status: HarnessExecutionStatus): boolean {
  return status === 'passed';
}

function normalizeHarnessExecutionResult(result: HarnessExecutionResult): HarnessExecutionResult {
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

function isWebhookLikeTarget(target: HarnessTarget): boolean {
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

function buildFullPath(controllerLocator: string, handlerLocator: string): string {
  const cp = controllerLocator.replace(/^\/|\/$/g, '');
  const mp = (handlerLocator || '').replace(/^\/|\/$/g, '');
  const full = mp ? `/${cp}/${mp}` : `/${cp}`;
  return full.replace(/\/+/g, '/');
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function measureParenBalance(value: string): number {
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

// ─── Constructor Dependency Extraction ──────────────────────────────────────

function extractConstructorAliases(content: string): Map<string, string> {
  const aliases = new Map<string, string>();
  const ctorMatch = content.match(/constructor\s*\(([\s\S]*?)\)\s*\{/);
  if (!ctorMatch) {
    return aliases;
  }

  const paramRe =
    /(?:@(?:Inject|InjectRedis|Optional)\([^)]*\)\s*)?(?:private|public|protected)?\s*(?:readonly\s+)?(\w+)\??\s*:\s*([A-Z][A-Za-z0-9_]+)/g;
  let match: RegExpExecArray | null;
  while ((match = paramRe.exec(ctorMatch[1])) !== null) {
    if (!infrastructureAliasNames().has(match[2])) {
      aliases.set(match[1], match[2]);
    }
  }

  return aliases;
}

// ─── Worker Detection ───────────────────────────────────────────────────────

interface RawWorkerDiscovery {
  file: string;
  line: number;
  queueName: string;
  handlerName: string;
}

/** Detect BullMQ workers created via `new Worker('queue-name', ...)` inside backend files. */
function rawWorkerDiscoveries(workerDir: string): RawWorkerDiscovery[] {
  const discoveries: RawWorkerDiscovery[] = [];

  if (!pathExists(workerDir)) {
    return discoveries;
  }

  const files = walkFiles(workerDir, ['.ts']).filter(
    (f) => !/\.(spec|test|d)\.ts$/.test(f) && !/node_modules/.test(f),
  );

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const workerRe =
      /new\s+Worker\s*\(\s*(?:['"`]([^'"`]+)['"`])\s*,\s*(?:async\s+)?(?:\([^)]*\)|function\s*\w*|[A-Za-z_]\w*)/g;
    let match: RegExpExecArray | null;
    const lines = content.split('\n');

    while ((match = workerRe.exec(content)) !== null) {
      const queueName = match[1];
      const precedingSlice = content.slice(0, match.index);
      const line = (precedingSlice.match(/\n/g) || []).length + 1;

      // Look up the wrapping function/class name
      let handlerName = `${queueName}-worker`;
      // Try to find a nearby export function or class
      const nearbyRe =
        /(?:export\s+(?:async\s+)?function\s+|export\s+class\s+|class\s+)([A-Za-z_]\w*)/g;
      let nearbyMatch: RegExpExecArray | null;
      while ((nearbyMatch = nearbyRe.exec(precedingSlice)) !== null) {
        handlerName = nearbyMatch[1];
      }

      discoveries.push({
        file: path.relative(workerDir, file),
        line,
        queueName,
        handlerName,
      });
    }
  }

  return discoveries;
}

/** Detect workers via `@Processor('queue-name')` and `@Process('job-name')` decorators. */
function nestjsBullMQDiscoveries(dir: string): RawWorkerDiscovery[] {
  const discoveries: RawWorkerDiscovery[] = [];

  if (!pathExists(dir)) {
    return discoveries;
  }

  const files = walkFiles(dir, ['.ts']).filter(
    (f) => !/\.(spec|test|d)\.ts$/.test(f) && !/node_modules/.test(f),
  );

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const processorRe = /@Processor\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
    let processorMatch: RegExpExecArray | null;
    while ((processorMatch = processorRe.exec(content)) !== null) {
      const queueName = processorMatch[1] || 'unknown-queue';
      const processRe = /@Process\(\s*(?:['"`]([^'"`]*)['"`])?\s*\)/g;
      let processMatch: RegExpExecArray | null;
      while ((processMatch = processRe.exec(content)) !== null) {
        const jobName = processMatch[1] || 'unknown-job';
        const precedingSlice = content.slice(0, processMatch.index);
        const line = (precedingSlice.match(/\n/g) || []).length + 1;

        discoveries.push({
          file: path.relative(dir, file),
          line,
          queueName,
          handlerName: jobName,
        });
      }
    }
  }

  return discoveries;
}

// ─── Public Method Detection ─────────────────────────────────────────────────

function getClassMethodDeclarationName(trimmedLine: string): string | null {
  const methodMatch = trimmedLine.match(
    /^(?:public|private|protected)?\s*(?:static\s+)?(?:async\s+)?([A-Za-z_]\w*)\s*(?:<[^>{}]+>)?\s*\(/,
  );
  if (!methodMatch) {
    return null;
  }

  const methodName = methodMatch[1];
  if (nonCallableMemberNames().has(methodName)) {
    return null;
  }

  return methodName;
}
import './__companions__/execution-harness-core.companion';
