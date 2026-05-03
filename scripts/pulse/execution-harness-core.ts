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
import * as fs from 'node:fs';
import {
  deriveZeroValue,
  discoverAllObservedArtifactFilenames,
  discoverDirectorySkipHintsFromEvidence,
  discoverExternalReceiverTokensFromEvidence,
  discoverHarnessExecutionStatusLabels,
  discoverHarnessTargetKindLabels,
  discoverPropertyPassedStatusFromTypeEvidence,
  discoverPropertyUnexecutedStatusFromExecutionEvidence,
  discoverRouteSeparatorFromRuntime,
} from './dynamic-reality-kernel';

// ─── Structural Grammar ─────────────────────────────────────────────────────

const ALL_ARTIFACTS = discoverAllObservedArtifactFilenames();
const EXTERNAL_TOKENS = discoverExternalReceiverTokensFromEvidence();
const PASSED_STATUSES = discoverPropertyPassedStatusFromTypeEvidence();
const UNEXECUTED_STATUSES = discoverPropertyUnexecutedStatusFromExecutionEvidence();

function harnessArtifactPath(): string {
  return `.pulse/current/${ALL_ARTIFACTS.harnessEvidence}`;
}

function targetKindFromDecorator(_decoratorName: string): HarnessTargetKind {
  return 'endpoint';
}

function ignoredDirectoryNames(): Set<string> {
  const base = new Set(discoverDirectorySkipHintsFromEvidence());
  const projectExtras = fs.existsSync('.gitignore')
    ? fs
        .readFileSync('.gitignore', 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('/') && !l.includes('*') && !l.includes('.'))
        .map((l) => l.replace(/^\//, '').replace(/\/$/, ''))
        .filter(Boolean)
    : [];
  for (const entry of projectExtras) base.add(entry);
  base.add('.git');
  return base;
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
  return normalized.length > deriveZeroValue() ? normalized : discoverRouteSeparatorFromRuntime();
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

const INBOUND_KIND_LABELS = new Set(
  [...discoverHarnessTargetKindLabels()].filter((k) => EXTERNAL_TOKENS.some((t) => k.includes(t))),
);
function isInboundDeliveryHarnessKind(kind: HarnessTargetKind): boolean {
  return INBOUND_KIND_LABELS.has(kind);
}

const ALL_EXECUTION_STATUS_LABELS = discoverHarnessExecutionStatusLabels();
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
function isObservedHarnessStatus(status: HarnessExecutionStatus): boolean {
  return OBSERVED_HARNESS_STATUSES.has(status);
}

function isPassedHarnessStatus(status: HarnessExecutionStatus): boolean {
  return PASSED_STATUSES.has(status);
}

function normalizeHarnessExecutionResult(result: HarnessExecutionResult): HarnessExecutionResult {
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

function isWebhookLikeTarget(target: HarnessTarget): boolean {
  const locatorText = target.routePattern || '';
  const method = target.httpMethod?.toUpperCase() ?? '';
  const hasExternalToken = EXTERNAL_TOKENS.some((token) =>
    new RegExp(`\\b${token}\\b`, 'i').test(locatorText),
  );
  return (
    method === 'POST' && (hasExternalToken || /signature|x-hub|x-signature/i.test(target.name))
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

interface ExtractedMethod {
  name: string;
  line: number;
  isPublic: boolean;
  returnType: string | null;
}

function extractPublicMethods(content: string): ExtractedMethod[] {
  const methods: ExtractedMethod[] = [];
  const lines = content.split('\n');
  let inClass = false;
  let classBraceDepth = 0;
  let pendingDecorators: string[] = [];
  let pendingMethod: { name: string; line: number; parenDepth: number; isPublic: boolean } | null =
    null;
  let inMethod = false;
  let methodBraceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    if (!inClass && /\bclass\s+\w+/.test(trimmed)) {
      inClass = true;
      classBraceDepth = 0;
      continue;
    }

    if (!inClass) {
      continue;
    }

    // Track class-level braces to know when we leave the class
    for (const ch of trimmed) {
      if (ch === '{') {
        classBraceDepth++;
      } else if (ch === '}') {
        classBraceDepth--;
      }
    }

    if (classBraceDepth <= 0 && inClass) {
      inClass = false;
      break;
    }

    if (!inMethod && !pendingMethod && trimmed.startsWith('@')) {
      pendingDecorators.push(trimmed);
      continue;
    }

    // Detect method declarations
    if (!inMethod && !pendingMethod) {
      const methodName = getClassMethodDeclarationName(trimmed);
      if (methodName) {
        // Determine if method is public (no access modifier = public in TS)
        const isPublic = !/^(private|protected)\s+/.test(trimmed) && !/^#/.test(trimmed);
        pendingMethod = {
          name: methodName,
          line: i + 1,
          parenDepth: 0,
          isPublic,
        };
      } else if (trimmed && !trimmed.startsWith('@')) {
        pendingDecorators = [];
      }
    }

    if (!inMethod && pendingMethod) {
      pendingMethod.parenDepth += measureParenBalance(trimmed);
    }

    if (!inMethod && pendingMethod && pendingMethod.parenDepth <= 0 && /\{\s*$/.test(trimmed)) {
      inMethod = true;
      methodBraceDepth = 0;
    }

    if (inMethod) {
      for (const ch of trimmed) {
        if (ch === '{') {
          methodBraceDepth++;
        } else if (ch === '}') {
          methodBraceDepth--;
        }
      }

      if (methodBraceDepth <= 0 && pendingMethod) {
        if (pendingMethod.isPublic) {
          methods.push({
            name: pendingMethod.name,
            line: pendingMethod.line,
            isPublic: true,
            returnType: null,
          });
        }
        inMethod = false;
        pendingMethod = null;
        pendingDecorators = [];
      }
    }
  }

  return methods;
}

// ─── Prisma Model Detection ─────────────────────────────────────────────────

function prismaAccessGrammar(): RegExp[] {
  return [
    /this\.(?:prisma|prismaAny)\.([a-z]\w+)\.\s*(?:create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany)\s*\(/g,
    /\(this\.prisma\s+as\s+[a][n][y]\)\.([a-z]\w+)\.\s*(?:create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany)\s*\(/g,
    /(?:prismaAny|prismaExt|prisma)\.([a-z]\w+)\.\s*(?:create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany)\s*\(/g,
    /[tT][xX]\.([a-z]\w+)\.\s*(?:create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany)\s*\(/g,
  ];
}

function collectPrismaModelsFromText(text: string): string[] {
  const models = new Set<string>();
  for (const pattern of prismaAccessGrammar()) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      models.add(match[1]);
    }
  }
  return [...models];
}

function resolveDependencyNames(
  file: string,
  className: string,
  methodName: string,
): Array<{ className: string; methodName: string | null }> {
  const dependencies: Array<{ className: string; methodName: string | null }> = [];
  let content: string;
  try {
    content = readTextFile(file, 'utf8');
  } catch {
    return dependencies;
  }

  const aliases = extractConstructorAliases(content);
  const aliasNames = [...aliases.keys()];

  // Scan method body for `this.alias.method()` calls
  const methodStartRe = new RegExp(
    `(?:public|private|protected)?\\s*(?:async\\s+)?${methodName}\\s*\\(`,
  );
  const methodMatch = content.match(methodStartRe);
  if (!methodMatch || typeof methodMatch.index !== 'number') {
    // Return constructor-level dependencies as default
    for (const [, svcName] of aliases) {
      dependencies.push({ className: svcName, methodName: null });
    }
    return dependencies;
  }

  // Extract the method body
  const afterMethod = content.slice(methodMatch.index);
  let braceDepth = 0;
  let bodyStart = -1;
  let bodyEnd = -1;
  for (let i = 0; i < afterMethod.length; i++) {
    const ch = afterMethod[i];
    if (ch === '{') {
      if (bodyStart === -1) {
        bodyStart = i;
      }
      braceDepth++;
    } else if (ch === '}') {
      braceDepth--;
      if (braceDepth === 0 && bodyStart !== -1) {
        bodyEnd = i;
        break;
      }
    }
  }

  const bodyText =
    bodyStart !== -1 && bodyEnd !== -1
      ? afterMethod.slice(bodyStart, bodyEnd)
      : afterMethod.slice(0, Math.min(600, afterMethod.length));

  for (const aliasName of aliasNames) {
    const svcName = aliases.get(aliasName);
    if (!svcName) {
      continue;
    }

    // Capture `this.alias.methodName(`
    const callRe = new RegExp(`this\\.${aliasName}\\.([A-Za-z_]\\w*)\\s*\\(`, 'g');
    let callMatch: RegExpExecArray | null;
    while ((callMatch = callRe.exec(bodyText)) !== null) {
      dependencies.push({ className: svcName, methodName: callMatch[1] });
    }
  }

  // If no method-level deps found, fall back to constructor-level
  if (dependencies.length === 0) {
    for (const [, svcName] of aliases) {
      dependencies.push({ className: svcName, methodName: null });
    }
  }

  return dependencies;
}

// ─── Main API ───────────────────────────────────────────────────────────────

/**
 * Build the complete execution harness catalog for the codebase.
 *
 * Discovers all executable targets (endpoints, services, workers, crons,
 * webhooks) and generates required fixtures for each. Does NOT execute
 * anything — the harness catalog is consumed by test runners and actors.
 *
 * Stores the result at `.pulse/current/PULSE_HARNESS_EVIDENCE.json`.
 *
 * @param rootDir - Repository root directory
 * @returns Complete harness evidence including targets, results, and summary
 */
export function buildExecutionHarness(rootDir: string): HarnessEvidence {
  const config = detectConfig(rootDir);

  // ── 1. Discover all executable targets ──
  const endpoints = discoverEndpoints(config);
  const services = discoverServices(config);
  const workers = discoverWorkers(config);
  const crons = discoverCrons(config);
  const webhooks = discoverWebhooks(config, endpoints);

  const allTargets = [...endpoints, ...services, ...workers, ...crons, ...webhooks];

  // ── 2. Load behavior graph for richer classification ──
  const behaviorGraph = readBehaviorGraph(rootDir);
  const behaviorGraphIndex = new Map<string, BehaviorNode>();
  if (behaviorGraph?.nodes) {
    for (const node of behaviorGraph.nodes) {
      behaviorGraphIndex.set(`${node.filePath}:${node.name}`, node);
    }
  }

  // ── 3. Classify execution feasibility for every target ──
  for (const target of allTargets) {
    const classification = classifyExecutionFeasibility(target, behaviorGraphIndex, rootDir);
    target.feasibility = classification.feasibility;
    target.feasibilityReason = classification.reason;
    target.generatedTests = [];
    target.generated = false;
  }

  // ── 4. Generate fixtures for every target ──
  for (const target of allTargets) {
    target.fixtures = generateFixturesForTarget(target, rootDir);
  }

  // ── 5. Generate governed harness blueprints for executable targets ──
  for (const target of allTargets) {
    if (target.feasibility !== 'cannot_execute') {
      target.generatedTests = generateTestHarnessCode(target);
    }
  }

  // ── 6. Build fixture data structures (blueprint, no real DB connection) ──
  const fixtureData = buildFixtureDataStructures(allTargets);

  // ── 7. Merge with existing results ──
  const existingResults = loadHarnessResults(rootDir);
  const resultsById = new Map(existingResults.map((r) => [r.targetId, r] as const));

  const combinedResults: HarnessExecutionResult[] = allTargets.map((target) => {
    const existing = resultsById.get(target.targetId);
    if (existing) {
      return normalizeHarnessExecutionResult(existing);
    }
    const ZERO = deriveZeroValue();
    return {
      targetId: target.targetId,
      status: 'not_executed' as const,
      executionTimeMs: ZERO,
      attempts: ZERO,
      error: null,
      output: null,
      dbSideEffects: [],
      logEntries: [],
      startedAt: '',
      finishedAt: '',
    };
  });

  // ── 8. Compute critical target stats ──
  const governedGroup = allTargets.filter(isCriticalHarnessTarget);

  const passedResults = combinedResults.filter((r) => isPassedHarnessStatus(r.status));
  const failedResults = combinedResults.filter((r) => r.status === 'failed');
  const blockedResults = combinedResults.filter((r) => r.status === 'blocked');

  const feasibilitySummary = buildFeasibilitySummary(allTargets);

  const summary = {
    totalTargets: allTargets.length,
    plannedTargets: allTargets.filter((t) =>
      t.generatedTests.some((test) => test.status === 'planned'),
    ).length,
    notExecutedTargets: combinedResults.filter(
      (r) => UNEXECUTED_STATUSES.has(r.status) || r.status === 'not_tested',
    ).length,
    testedTargets: combinedResults.filter((r) => isObservedHarnessStatus(r.status)).length,
    passedTargets: passedResults.length,
    failedTargets: failedResults.length,
    blockedTargets: blockedResults.length,
    criticalTargets: governedGroup.length,
    criticalTested: governedGroup.filter((t) => {
      const r = combinedResults.find((rr) => rr.targetId === t.targetId);
      return r && isObservedHarnessStatus(r.status);
    }).length,
    criticalPassed: governedGroup.filter((t) => {
      const r = combinedResults.find((rr) => rr.targetId === t.targetId);
      return r && isPassedHarnessStatus(r.status);
    }).length,
    executableTargets: feasibilitySummary.executableTargets,
    needsStagingTargets: feasibilitySummary.needsStagingTargets,
    cannotExecuteTargets: feasibilitySummary.cannotExecuteTargets,
    generatedTestCount: feasibilitySummary.generatedTestCount,
  };

  const evidence: HarnessEvidence = {
    generatedAt: formatTimestamp(),
    summary,
    targets: allTargets,
    results: combinedResults,
    behaviorNodeCount: behaviorGraphIndex.size,
  };

  // ── 9. Write artifact to disk ──
  const outputFileAbs = safeJoin(rootDir, harnessArtifactPath());
  ensureDir(path.dirname(outputFileAbs), { recursive: true });
  writeTextFile(outputFileAbs, JSON.stringify(evidence, null, 2));

  return evidence;
}

/**
 * Discover HTTP endpoint targets from NestJS controllers.
 *
 * Scans `@Controller()` classes and extracts all route handlers decorated with
 * `@Get`, `@Post`, `@Put`, `@Delete`, or `@Patch`. Determines auth requirements
 * from `@UseGuards()` and `@Public()` decorators.
 *
 * @param config - PULSE configuration with backend directory paths
 * @returns Array of endpoint harness targets
 */
export function discoverEndpoints(config: PulseConfig): HarnessTarget[] {
  const parsedBackendEntries = parseBackendRoutes(config);

  return parsedBackendEntries.map((parsedEntry) => {
    const kind = targetKindFromDecorator(parsedEntry.httpMethod);
    const normalizedLocator = normalizeDiscoveredLocator(parsedEntry.fullPath);
    const targetId = `endpoint:${parsedEntry.httpMethod.toLowerCase()}:${camelToKebab(normalizedLocator)}`;

    const requiresAuth = !parsedEntry.isPublic && parsedEntry.guards.length > 0;
    const requiresTenant =
      requiresAuth &&
      (parseRouteParameters(normalizedLocator).length > 0 ||
        parsedEntry.serviceCalls.length > 0 ||
        mutatingHttpVerbs().has(parsedEntry.httpMethod.toUpperCase()));

    return {
      targetId,
      kind,
      name: `${parsedEntry.controllerPath}/${parsedEntry.methodName}`,
      filePath: parsedEntry.file,
      methodName: parsedEntry.methodName,
      routePattern: normalizedLocator,
      httpMethod: parsedEntry.httpMethod,
      requiresAuth,
      requiresTenant,
      dependencies: parsedEntry.serviceCalls.map((call) => {
        const dotIndex = call.lastIndexOf('.');
        return dotIndex !== -1 ? call.slice(0, dotIndex) : call;
      }),
      fixtures: [],
      feasibility: 'executable',
      feasibilityReason: '',
      generatedTests: [],
      generated: false,
    };
  });
}

/**
 * Discover service-level targets from `@Injectable()` classes.
 *
 * Scans service files and extracts every public method as a harness target.
 * Each target's dependencies are resolved by tracing constructor injection
 * and intra-method `this.dependency.method()` calls.
 *
 * @param config - PULSE configuration with backend directory paths
 * @returns Array of service harness targets
 */
export function discoverServices(config: PulseConfig): HarnessTarget[] {
  const targets: HarnessTarget[] = [];

  const files = walkFiles(config.backendDir, ['.ts']).filter(
    (f) =>
      !/\.(spec|test|d)\.ts$/.test(f) &&
      !/node_modules/.test(f) &&
      (/\.service\.ts$/.test(f) ||
        /\.engine\.ts$/.test(f) ||
        /\.guard\.ts$/.test(f) ||
        /\.interceptor\.ts$/.test(f) ||
        /\.middleware\.ts$/.test(f)),
  );

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    if (!/@Injectable\(\)/.test(content)) {
      continue;
    }

    const classMatch = content.match(/export\s+class\s+(\w+)/);
    const className = classMatch ? classMatch[1] : path.basename(file, '.ts');
    const methods = extractPublicMethods(content);
    const aliases = extractConstructorAliases(content);

    for (const method of methods) {
      const targetId = `service:${camelToKebab(className)}:${camelToKebab(method.name)}`;
      const relFile = path.relative(config.rootDir, file);

      const dependencyEdges = resolveDependencyNames(file, className, method.name);
      const serviceDependencyIds = dependencyEdges.map(
        (dep) => `service:${camelToKebab(dep.className)}`,
      );

      // Detect Prisma models accessed within the method body
      const methodRe = new RegExp(`\\b${method.name}\\s*(?:<[^>]+>)?\\s*\\(`);
      const methodMatch = content.match(methodRe);
      let prismaModels: string[] = [];
      let methodBodyText = '';
      if (methodMatch && typeof methodMatch.index === 'number') {
        const afterMethod = content.slice(methodMatch.index);
        let braceDepth = 0;
        let bodyStart = -1;
        let bodyEnd = -1;
        for (let i = 0; i < afterMethod.length; i++) {
          const ch = afterMethod[i];
          if (ch === '{') {
            if (bodyStart === -1) {
              bodyStart = i;
            }
            braceDepth++;
          } else if (ch === '}') {
            braceDepth--;
            if (braceDepth === 0 && bodyStart !== -1) {
              bodyEnd = i;
              break;
            }
          }
        }
        const bodyText =
          bodyStart !== -1 && bodyEnd !== -1
            ? afterMethod.slice(bodyStart, bodyEnd + 1)
            : afterMethod.slice(0, Math.min(2000, afterMethod.length));
        methodBodyText = bodyText;
        prismaModels = collectPrismaModelsFromText(bodyText);
      }
      const hasPersistentMutation =
        prismaModels.length > 0 && persistentStateMutationShape().test(methodBodyText);
      const requiresAuth = false;
      const requiresTenant = hasPersistentMutation;
      const dependencies = unique([
        ...serviceDependencyIds,
        ...prismaModels.map((model) => `model:${model}`),
      ]);

      targets.push({
        targetId,
        kind: 'service',
        name: `${className}.${method.name}`,
        filePath: relFile,
        methodName: method.name,
        routePattern: null,
        httpMethod: null,
        requiresAuth,
        requiresTenant,
        dependencies,
        fixtures: [],
        feasibility: 'executable',
        feasibilityReason: '',
        generatedTests: [],
        generated: false,
      });
    }
  }

  return targets;
}

/**
 * Discover worker targets from BullMQ processors.
 *
 * Detects both raw `new Worker('queue-name', ...)` invocations and NestJS
 * `@Processor()` / `@Process()` decorator patterns. Each job handler is
 * registered as a harness target.
 *
 * @param config - PULSE configuration with backend and worker directory paths
 * @returns Array of worker harness targets
 */
export function discoverWorkers(config: PulseConfig): HarnessTarget[] {
  const targets: HarnessTarget[] = [];

  // Raw BullMQ workers in backend
  const backendDiscoveries = rawWorkerDiscoveries(config.backendDir);
  for (const discovery of backendDiscoveries) {
    const targetId = `worker:${camelToKebab(discovery.queueName)}:${camelToKebab(discovery.handlerName)}`;

    targets.push({
      targetId,
      kind: 'worker',
      name: `${discovery.queueName}/${discovery.handlerName}`,
      filePath: discovery.file,
      methodName: discovery.handlerName,
      routePattern: null,
      httpMethod: null,
      requiresAuth: false,
      requiresTenant: false,
      dependencies: [],
      fixtures: [],
      feasibility: 'needs_staging',
      feasibilityReason: 'Worker requires queue infrastructure',
      generatedTests: [],
      generated: false,
    });
  }

  // NestJS BullMQ @Processor decorators in backend
  const nestjsBackend = nestjsBullMQDiscoveries(config.backendDir);
  for (const discovery of nestjsBackend) {
    const targetId = `worker:${camelToKebab(discovery.queueName)}:${camelToKebab(discovery.handlerName)}`;

    if (targets.some((t) => t.targetId === targetId)) {
      continue;
    }

    targets.push({
      targetId,
      kind: 'worker',
      name: `${discovery.queueName}/${discovery.handlerName}`,
      filePath: discovery.file,
      methodName: discovery.handlerName,
      routePattern: null,
      httpMethod: null,
      requiresAuth: false,
      requiresTenant: false,
      dependencies: [],
      fixtures: [],
      feasibility: 'needs_staging',
      feasibilityReason: 'Worker requires queue infrastructure',
      generatedTests: [],
      generated: false,
    });
  }

  // Worker directory (if applicable)
  if (config.workerDir && config.workerDir !== config.backendDir) {
    const workerDiscoveries = rawWorkerDiscoveries(config.workerDir);
    for (const discovery of workerDiscoveries) {
      const targetId = `worker:${camelToKebab(discovery.queueName)}:${camelToKebab(discovery.handlerName)}`;

      if (targets.some((t) => t.targetId === targetId)) {
        continue;
      }

      targets.push({
        targetId,
        kind: 'worker',
        name: `${discovery.queueName}/${discovery.handlerName}`,
        filePath: discovery.file,
        methodName: discovery.handlerName,
        routePattern: null,
        httpMethod: null,
        requiresAuth: false,
        requiresTenant: false,
        dependencies: [],
        fixtures: [],
        feasibility: 'needs_staging',
        feasibilityReason: 'Worker requires queue infrastructure',
        generatedTests: [],
        generated: false,
      });
    }
  }

  return targets;
}

/**
 * Discover cron targets from `@Cron()` decorated methods.
 *
 * Scans the backend directory for NestJS `@Cron(schedule)` decorators.
 * Each scheduled method becomes a harness target.
 *
 * @param config - PULSE configuration with backend directory paths
 * @returns Array of cron harness targets
 */
export function discoverCrons(config: PulseConfig): HarnessTarget[] {
  const targets: HarnessTarget[] = [];

  const files = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => !/\.(spec|test|d)\.ts$/.test(f) && !/node_modules/.test(f),
  );

  for (const file of files) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    if (!/@Cron\s*\(/.test(content)) {
      continue;
    }

    const classMatch = content.match(/export\s+class\s+(\w+)/);
    const className = classMatch ? classMatch[1] : path.basename(file, '.ts');

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      const cronMatch = trimmed.match(/@Cron\(\s*([^)]*)\)/);
      if (!cronMatch) {
        continue;
      }

      const cronExpr = cronMatch[1].replace(/\s+/g, ' ').trim();

      // Find the method name on the next line(s)
      let methodName = 'unknown';
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const methodLine = lines[j].trim();
        if (methodLine.startsWith('@')) {
          continue;
        }
        const nameMatch = methodLine.match(
          /^(?:public|private|protected)?\s*(?:async\s+)?([A-Za-z_]\w*)\s*\(/,
        );
        if (nameMatch) {
          methodName = nameMatch[1];
          break;
        }
      }

      const targetId = `cron:${camelToKebab(className)}:${camelToKebab(methodName)}`;

      targets.push({
        targetId,
        kind: 'cron',
        name: `${className}.${methodName} (${cronExpr})`,
        filePath: relFile,
        methodName,
        routePattern: null,
        httpMethod: null,
        requiresAuth: false,
        requiresTenant: false,
        dependencies: [],
        fixtures: [],
        feasibility: 'executable',
        feasibilityReason: '',
        generatedTests: [],
        generated: false,
      });
    }
  }

  return targets;
}

/**
 * Discover webhook handler targets.
 *
 * Identifies webhook endpoints from POST routes and inbound delivery markers
 * such as callback, event, or signature handling. Each handler is registered
 * as a harness target with webhook-specific fixture requirements.
 *
 * @param config - PULSE configuration with backend directory paths
 * @param allEndpoints - Pre-discovered endpoint targets (used to filter webhooks)
 * @returns Array of webhook harness targets
 */
export function discoverWebhooks(
  config: PulseConfig,
  allEndpoints: HarnessTarget[] = [],
): HarnessTarget[] {
  const endpoints = allEndpoints.length > 0 ? allEndpoints : discoverEndpoints(config);

  return endpoints
    .filter((ep) => {
      return isWebhookLikeTarget(ep);
    })
    .map((ep) => ({
      ...ep,
      kind: 'webhook' as HarnessTargetKind,
      targetId: ep.targetId.replace(/^endpoint:/, 'webhook:'),
      requiresAuth: false, // webhooks typically use signature verification, not JWT
    }));
}

/**
 * Generate required fixtures for a given target.
 *
 * Analyzes the target's dependencies and characteristics to determine which
 * fixtures are needed for isolation testing. Fixture kinds include DB seeds,
 * mock services, test environment, queue messages, webhook payloads, and
 * auth tokens.
 *
 * @param target - The harness target to generate fixtures for
 * @param _rootDir - Repository root directory
 * @returns Array of required harness fixtures
 */
export function generateFixturesForTarget(
  target: HarnessTarget,
  _rootDir: string,
): HarnessFixture[] {
  const fixtures: HarnessFixture[] = [];

  // Test environment fixture — always required
  fixtures.push({
    kind: 'test_env',
    name: 'pulse-test-env',
    description: 'PULSE test environment with isolated database and Redis',
    data: { dbPrefix: 'pulse_test', redisPrefix: 'pulse_test' },
    ['required']: true,
    generated: false,
  });

  // Auth token fixture — required when target requires authentication
  if (target.requiresAuth) {
    fixtures.push({
      kind: 'auth_token',
      name: 'pulse-auth-token',
      description: 'Credential context material for discovered guard boundaries',
      data: {
        targetId: target.targetId,
        ['guardBoundaryRequired']: true,
        routeParameters: target.routePattern ? parseRouteParameters(target.routePattern) : [],
        credentialClaims: {
          subject: '__pulse_subject__',
          context: target.requiresTenant ? '__pulse_context__' : null,
        },
      },
      ['required']: true,
      generated: false,
    });
  }

  // DB seed fixture — required for targets with persistence dependencies
  const hasDbDependency =
    target.dependencies.some((d) => /prisma|database|repository|model/i.test(d)) ||
    target.kind === 'service' ||
    target.kind === 'endpoint';

  if (hasDbDependency) {
    fixtures.push({
      kind: 'db_seed',
      name: 'pulse-db-seed',
      description: `Database seed for target ${target.targetId}`,
      data: {
        targetId: target.targetId,
        requiredModels: target.dependencies.filter((d) => /^[A-Z]/.test(d)),
      },
      ['required']: false,
      generated: false,
    });
  }

  // Queue message fixture — for worker targets
  if (target.kind === 'worker') {
    fixtures.push({
      kind: 'queue_message',
      name: `pulse-queue-payload:${target.targetId}`,
      description: `Sample BullMQ job payload for ${target.name}`,
      data: {
        queueName: target.name.split('/')[0] || 'unknown',
        jobName: target.methodName || 'unknown-job',
        payload: {
          context: target.requiresTenant ? '__pulse_context__' : null,
          testMode: true,
          pulseRun: 'harness-discovery',
        },
      },
      ['required']: true,
      generated: false,
    });
  }

  // Webhook payload fixture — for webhook targets
  if (target.kind === 'webhook') {
    fixtures.push({
      kind: 'webhook_payload',
      name: `pulse-webhook-payload:${target.targetId}`,
      description: `Sample webhook payload for ${target.name}`,
      data: {
        ['event']: 'pulse.test.event',
        timestamp: formatTimestamp(),
        data: { id: 'pulse-test-id', testMode: true },
      },
      ['required']: true,
      generated: false,
    });
  }

  // Mock service fixtures — for dependent services
  for (const dep of target.dependencies) {
    const depName = dep.replace(/^service:/, '');
    if (!fixtures.some((f) => f.kind === 'mock_service' && f.name === depName)) {
      fixtures.push({
        kind: 'mock_service',
        name: depName,
        description: `Mock for ${depName} used by ${target.targetId}`,
        data: { targetId: target.targetId, dependency: depName },
        ['required']: true,
        generated: false,
      });
    }
  }

  return fixtures;
}

// ─── Behavior Graph Integration ────────────────────────────────────────────

/**
 * Load the behavior graph artifact produced by behavior-graph.ts.
 *
 * Behavior nodes carry per-function analysis (inputs, outputs, state access,
 * external calls, risk level, execution mode) used to classify harness
 * targets for execution feasibility.
 */
export function readBehaviorGraph(rootDir: string): BehaviorGraph | null {
  const behaviorGraphFile = safeJoin(rootDir, behaviorGraphArtifactPath());
  if (!pathExists(behaviorGraphFile)) {
    return null;
  }
  try {
    return readJsonFile<BehaviorGraph>(behaviorGraphFile);
  } catch {
    return null;
  }
}

// ─── Execution Feasibility Classification ────────────────────────────────────

function behaviorGraphArtifactPath(): string {
  return `.pulse/current/${ALL_ARTIFACTS.behaviorGraph}`;
}

function externalCallShape(): RegExp {
  return /\b(?:fetch|axios|httpService|request)\s*(?:<[^>]*>)?\s*\(|\.(?:get|post|put|patch|delete)\s*\(\s*['"`]https?:\/\//i;
}

function infrastructureBoundaryShape(): RegExp {
  return /@\s*(?:Processor|Process|Cron|OnQueue\w*)\b|\b(?:new\s+Queue|QueueEvents|EventEmitter|emit|publish|subscribe)\s*\(/i;
}

function destructiveStateAccessShape(): RegExp {
  return /\.(?:delete|deleteMany|upsert)\s*\(/i;
}

/**
 * Classify a harness target's execution feasibility.
 *
 * Rules (in priority order):
 *   1. cannot_execute — no method to call, or browser-only UI handlers
 *   2. needs_staging — external API calls, queues, webhooks, real DB required
 *   3. executable     — everything else: pure logic, internal services, DB-only
 *
 * Behavior graph nodes are consulted when available to surface external calls
 * and state access that regex-based discovery cannot fully resolve.
 */
export function classifyExecutionFeasibility(
  target: HarnessTarget,
  behaviorNodes: Map<string, BehaviorNode>,
  rootDir?: string,
): { feasibility: ExecutionFeasibility; reason: string } {
  const targetLookupId = `${target.filePath}:${target.methodName ?? constructorMemberName()}`;

  // ── Check 1: no method means we cannot execute ──
  if (!target.methodName || isConstructorMemberName(target.methodName)) {
    return {
      feasibility: 'cannot_execute',
      reason: 'No callable method or function identified — may be a class scaffold',
    };
  }

  // ── Check 2: browser-only UI handlers ──
  if (
    target.kind === 'script' ||
    target.kind === 'controller' ||
    (target.filePath.toLowerCase().includes('/frontend/') &&
      !target.filePath.toLowerCase().includes('/api/'))
  ) {
    return {
      feasibility: 'cannot_execute',
      reason: `Target kind "${target.kind}" requires browser interaction or is frontend-only`,
    };
  }

  // ── Look up behavior node for richer context ──
  const behaviorNode = behaviorNodes.get(targetLookupId);

  // ── Check 3: behavior graph requires governed staging execution ──
  if (behaviorNode && behaviorNode.executionMode === 'human_required') {
    return {
      feasibility: 'needs_staging',
      reason: `Behavior graph requires governed staging execution for "${behaviorNode.name}" before this can become observed proof.`,
    };
  }

  // ── Check 4: external API calls ──
  if (behaviorNode?.externalCalls && behaviorNode.externalCalls.length > 0) {
    const upstreamNames = [...new Set(behaviorNode.externalCalls.map((c) => c.provider))];
    return {
      feasibility: 'needs_staging',
      reason: `Behavior graph detects external calls to: ${upstreamNames.join(', ')}`,
    };
  }

  const targetSource = rootDir ? readHarnessTargetSource(rootDir, target.filePath) : '';

  if (targetSource && externalCallShape().test(targetSource)) {
    return {
      feasibility: 'needs_staging',
      reason:
        'Source contains an outbound HTTP call shape that requires network-controlled staging',
    };
  }

  // ── Check 5: queue/event infrastructure boundaries ──
  if (targetSource && infrastructureBoundaryShape().test(targetSource)) {
    return {
      feasibility: 'needs_staging',
      reason: 'Source contains queue/event infrastructure shape that requires staging services',
    };
  }

  if (target.kind === 'worker' || target.kind === 'webhook') {
    return {
      feasibility: 'needs_staging',
      reason: `Target kind "${target.kind}" requires queue infrastructure or inbound webhook endpoint`,
    };
  }

  // ── Check 6: destructive DB writes ──
  if (
    behaviorNode?.stateAccess &&
    behaviorNode.stateAccess.length > 0 &&
    behaviorNode.stateAccess.some((s) => s.operation === 'delete' || s.operation === 'upsert')
  ) {
    return {
      feasibility: 'needs_staging',
      reason: `Target performs destructive DB writes on: ${behaviorNode.stateAccess.map((s) => s.model).join(', ')}`,
    };
  }
  if (targetSource && destructiveStateAccessShape().test(targetSource)) {
    return {
      feasibility: 'needs_staging',
      reason: 'Source contains destructive persistent-state access that requires sandboxed staging',
    };
  }

  // ── Default: executable ──
  const supports = behaviorNode
    ? `behavior-graph confirms ${behaviorNode.kind} (${behaviorNode.executionMode})`
    : 'no external deps or infrastructure detected';

  return {
    feasibility: 'executable',
    reason: `Target is self-contained: ${supports}`,
  };
}

function readHarnessTargetSource(rootDir: string, sourceLocator: string): string {
  const absoluteSourceFile = path.isAbsolute(sourceLocator)
    ? sourceLocator
    : safeJoin(rootDir, sourceLocator);
  if (!pathExists(absoluteSourceFile)) {
    return '';
  }
  try {
    return readTextFile(absoluteSourceFile);
  } catch {
    return '';
  }
}

// ─── Test Harness Code Generation ────────────────────────────────────────────

/**
 * Generate test harness code for a given executable or governed-validation target.
 *
 * Produces a non-executed blueprint. The blueprint is deliberately not marked
 * runnable because fixture selection and assertions must be materialized from
 * real code behavior before this can become proof.
 */
export function generateTestHarnessCode(target: HarnessTarget): HarnessGeneratedTest[] {
  if (target.feasibility === 'cannot_execute') {
    return [];
  }

  const suiteName = camelToKebab(target.name).replace(/\//g, '_');
  const executionMode = target.feasibility === 'needs_staging' ? 'governed_validation' : 'ai_safe';
  const terminalReason =
    target.feasibility === 'needs_staging'
      ? target.feasibilityReason
      : `Target is self-contained and can be converted into an ${executionMode} executable probe.`;

  const plannedStatus = [...UNEXECUTED_STATUSES].find((s) => s === 'planned') ?? 'planned';
  return [
    {
      testName: `[PULSE] ${suiteName} — planned ${executionMode} harness`,
      status: plannedStatus as HarnessGeneratedTest['status'],
      framework: target.httpMethod ? 'supertest' : 'jest',
      canRunLocally: false,
      code: buildHarnessBlueprintCode(target, executionMode, terminalReason),
    },
  ];
}

function buildHarnessBlueprintCode(
  target: HarnessTarget,
  executionMode: 'ai_safe' | 'governed_validation',
  terminalReason: string,
): string {
  const assertionItems = buildHarnessRequiredAssertions(target);
  const blueprint = {
    targetId: target.targetId,
    kind: target.kind,
    name: target.name,
    filePath: target.filePath,
    methodName: target.methodName,
    routePattern: target.routePattern,
    httpMethod: target.httpMethod,
    requiresAuth: target.requiresAuth,
    requiresTenant: target.requiresTenant,
    executionMode,
    feasibility: target.feasibility,
    terminalReason,
    evidenceMode: 'blueprint',
    executed: false,
    coverageCountsAsObserved: false,
    validationCommand: `node scripts/pulse/run.js --guidance # refresh harness blueprint for ${target.targetId}`,
    executionPlan: buildHarnessExecutionPlan(target, executionMode),
    expectedEvidence: buildHarnessExpectedEvidence(target),
    structuralSafetyClassification: {
      risk: isCriticalHarnessTarget(target) ? 'high' : 'medium',
      safeToExecute: target.feasibility !== 'cannot_execute',
      executionMode,
      protectedSurface: false,
      reason:
        target.feasibility === 'needs_staging'
          ? target.feasibilityReason
          : 'Target has no detected external infrastructure boundary in the harness classifier.',
    },
    artifactLinks: [
      {
        artifactPath: harnessArtifactPath(),
        relationship: 'harness_evidence',
      },
      {
        artifactPath: target.filePath,
        relationship: 'target_source',
      },
    ],
    dependencies: target.dependencies,
    requiredFixtures: target.fixtures
      .filter((fixture) => fixture.required)
      .map((fixture) => ({
        kind: fixture.kind,
        name: fixture.name,
        description: fixture.description,
      })),
    requiredAssertions: assertionItems,
  };

  return [
    `const pulseHarnessBlueprint = ${JSON.stringify(blueprint, null, 2)};`,
    '',
    "throw new Error('PULSE_HARNESS_BLUEPRINT_NOT_EXECUTED: materialize fixtures and assertions before running this plan');",
  ].join('\n');
}

function buildHarnessExecutionPlan(
  target: HarnessTarget,
  executionMode: 'ai_safe' | 'governed_validation',
): Array<{ step: string; required: boolean; detail: string }> {
  const plan: Array<{ step: string; required: boolean; detail: string }> = [
    {
      step: 'materialize_target',
      ['required']: true,
      detail: `Import ${target.filePath} through the owning package test adapter before invoking ${target.methodName ?? target.name}.`,
    },
    {
      step: 'bind_fixtures',
      ['required']: true,
      detail:
        'Bind every required fixture from this blueprint to real constructors, HTTP app, queue, or database adapters.',
    },
  ];

  if (target.httpMethod && target.routePattern) {
    plan.push({
      step: 'http_contract',
      ['required']: true,
      detail: `Exercise ${target.httpMethod.toUpperCase()} ${target.routePattern} through the app adapter and assert status, response body, and error body contracts.`,
    });
  }

  if (target.kind === 'service') {
    plan.push({
      step: 'service_contract',
      ['required']: true,
      detail:
        'Instantiate the service with explicit dependency doubles or test adapters and assert concrete return values and thrown errors.',
    });
  }

  if (target.kind === 'worker') {
    plan.push({
      step: 'queue_contract',
      ['required']: true,
      detail:
        'Dispatch a real queue payload in an isolated queue adapter and record job completion, retry, and failure evidence.',
    });
  }

  if (target.kind === 'webhook') {
    plan.push({
      step: 'webhook_contract',
      ['required']: true,
      detail:
        'Send signed and invalid inbound payloads through the webhook route and assert acknowledgement, rejection, and idempotency behavior.',
    });
  }

  if (target.kind === 'cron') {
    plan.push({
      step: 'schedule_contract',
      ['required']: true,
      detail:
        'Invoke the scheduled handler through a controlled clock or direct scheduler adapter and record side effects.',
    });
  }

  if (target.requiresAuth) {
    plan.push({
      step: 'auth_boundary',
      ['required']: true,
      detail:
        'Run positive, missing credential, and malformed credential attempts against the discovered guard boundary.',
    });
  }

  if (target.requiresTenant) {
    plan.push({
      step: 'tenant_boundary',
      ['required']: true,
      detail:
        'Run matching-context and mismatched-context attempts before a pass/fail status can count as observed evidence.',
    });
  }

  if (hasPersistenceDependency(target)) {
    plan.push({
      step: 'side_effects',
      ['required']: true,
      detail:
        'Record database reads/writes before and after execution and attach model-level side-effect evidence.',
    });
  }

  plan.push({
    step: 'record_evidence',
    ['required']: true,
    detail: `Persist attempts, timestamps, logs, output, and side effects; ${executionMode} blueprints remain not observed until this exists.`,
  });

  return plan;
}

function buildHarnessRequiredAssertions(target: HarnessTarget): string[] {
  const assertions = [
    'materialize target import and dependency setup from the owning package',
    'bind fixtures to real constructors, HTTP app, queue, or database test adapter',
    'assert concrete output contract instead of defined/non-error placeholders',
    'record attempts, timestamps, output, logs, and side effects before status can pass',
  ];

  if (target.httpMethod) {
    assertions.push(
      'assert HTTP status, response schema, and error schema for the discovered route',
    );
  }

  if (target.requiresAuth) {
    assertions.push('assert authenticated and unauthenticated credential boundaries');
  }

  if (target.requiresTenant) {
    assertions.push('assert same-context success and cross-context rejection');
  }

  if (hasPersistenceDependency(target)) {
    assertions.push('assert persistent side effects and rollback or isolation evidence');
  }

  if (target.kind === 'worker') {
    assertions.push('assert queue job lifecycle, retry behavior, and failure handling');
  }

  if (target.kind === 'webhook') {
    assertions.push(
      'assert signed payload acceptance, invalid signature rejection, and duplicate delivery handling',
    );
  }

  return assertions;
}

function buildHarnessExpectedEvidence(
  target: HarnessTarget,
): Array<{ kind: string; required: boolean; reason: string }> {
  const expectedEvidence: Array<{ kind: string; required: boolean; reason: string }> = [
    {
      kind: 'runtime',
      ['required']: true,
      reason:
        'Harness blueprint must be executed and recorded with attempts, timestamps, and pass/fail status.',
    },
  ];

  if (target.httpMethod) {
    expectedEvidence.push({
      kind: 'integration',
      ['required']: true,
      reason:
        'HTTP target must validate request, response, and status contract through the owning app adapter.',
    });
  }

  if (target.requiresAuth || target.requiresTenant) {
    expectedEvidence.push({
      kind: 'isolation',
      ['required']: true,
      reason:
        'Auth or tenant metadata requires positive and negative isolation proof before observation.',
    });
  }

  if (hasPersistenceDependency(target)) {
    expectedEvidence.push({
      kind: 'side_effect',
      ['required']: true,
      reason: 'Persistent dependency requires recorded state access and side-effect verification.',
    });
  }

  return expectedEvidence;
}

// ─── Fixture Data Structure Builders ─────────────────────────────────────────

/**
 * Build fixture data structures for common scenarios without connecting to
 * live infrastructure. These are blueprint data definitions consumed by
 * test runners when they actually execute.
 */
export function buildFixtureDataStructures(targets: HarnessTarget[]): Record<string, unknown> {
  const dbModels = new Set<string>();
  const queueNames = new Set<string>();
  const webhookEndpoints: Array<{ locator: string; targetId: string }> = [];

  for (const t of targets) {
    for (const f of t.fixtures) {
      if (f.kind === 'db_seed' && f.data && typeof f.data === 'object') {
        const data = f.data as Record<string, unknown>;
        if (Array.isArray(data.requiredModels)) {
          for (const m of data.requiredModels) {
            dbModels.add(String(m));
          }
        }
      }
      if (f.kind === 'queue_message' && f.data && typeof f.data === 'object') {
        const data = f.data as Record<string, unknown>;
        if (typeof data.queueName === 'string') {
          queueNames.add(data.queueName);
        }
      }
    }
    if (t.kind === 'webhook' && t.routePattern) {
      webhookEndpoints.push({ locator: t.routePattern, targetId: t.targetId });
    }
  }

  return {
    dbSeeds: [...dbModels].map((model) => ({
      model,
      table: camelToKebab(model),
      ['seedRecords']: 5,
      ['defaultFields']: { id: 'uuid-string', createdAt: 'Date', updatedAt: 'Date' },
    })),
    queueFixtures: [...queueNames].map((name) => ({
      queueName: name,
      sampleJob: {
        id: 'pulse-test-job-id',
        data: { testMode: true, pulseRun: 'harness-discovery' },
        opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
      },
    })),
    webhookFixtures: webhookEndpoints.map((w) => ({
      path: w.locator,
      targetId: w.targetId,
      samplePayload: {
        ['event']: 'pulse.test.event',
        timestamp: formatTimestamp(),
        data: { id: 'pulse-test-id', testMode: true },
      },
      signatureHeader: 'x-webhook-signature',
    })),
    authFixtures: {
      testTokenPayload: {
        subject: '__pulse_subject__',
        context: '__pulse_context__',
        claims: {},
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      },
    },
  };
}

// ─── Feasibility Summary Builder ─────────────────────────────────────────────

function buildFeasibilitySummary(targets: HarnessTarget[]): {
  executableTargets: number;
  needsStagingTargets: number;
  cannotExecuteTargets: number;
  generatedTestCount: number;
} {
  let executableTargets = 0;
  let needsStagingTargets = 0;
  let cannotExecuteTargets = 0;
  let generatedTestsTotal = 0;

  for (const t of targets) {
    switch (t.feasibility) {
      case 'executable':
        executableTargets++;
        break;
      case 'needs_staging':
        needsStagingTargets++;
        break;
      case 'cannot_execute':
        cannotExecuteTargets++;
        break;
    }
    generatedTestsTotal += t.generatedTests.length;
  }

  return {
    executableTargets,
    needsStagingTargets,
    cannotExecuteTargets,
    generatedTestCount: generatedTestsTotal,
  };
}

/**
 * Load previously stored harness execution results from disk.
 *
 * Reads the harness evidence artifact at `.pulse/current/PULSE_HARNESS_EVIDENCE.json`
 * and returns the embedded results. Returns an empty array if no prior results exist.
 *
 * @param rootDir - Repository root directory
 * @returns Array of previously stored harness execution results
 */
export function loadHarnessResults(rootDir: string): HarnessExecutionResult[] {
  const harnessEvidenceFile = safeJoin(rootDir, harnessArtifactPath());

  if (!pathExists(harnessEvidenceFile)) {
    return [];
  }

  try {
    const evidence = readJsonFile<HarnessEvidence>(harnessEvidenceFile);
    return Array.isArray(evidence.results)
      ? evidence.results.map(normalizeHarnessExecutionResult)
      : [];
  } catch {
    return [];
  }
}
