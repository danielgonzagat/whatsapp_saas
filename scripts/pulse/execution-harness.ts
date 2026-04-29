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

// ─── Constants ───────────────────────────────────────────────────────────────

const HARNESS_ARTIFACT_PATH = '.pulse/current/PULSE_HARNESS_EVIDENCE.json';

const TARGET_KIND_MAP: Record<string, HarnessTargetKind> = {
  Get: 'endpoint',
  Post: 'endpoint',
  Put: 'endpoint',
  Patch: 'endpoint',
  Delete: 'endpoint',
  Head: 'endpoint',
  Options: 'endpoint',
};

const IGNORE_DIRS = new Set([
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

const NON_METHOD_NAMES = new Set([
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

const SERVICE_ALIAS_IGNORE = new Set([
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

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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

function normalizeRoute(value: string): string {
  return (
    String(value || '')
      .trim()
      .replace(/\/+/g, '/')
      .replace(/\/$/, '') || '/'
  );
}

function hasPersistenceDependency(target: HarnessTarget): boolean {
  return target.dependencies.some((dependency) =>
    /prisma|database|repository|model/i.test(dependency),
  );
}

export function isCriticalHarnessTarget(target: HarnessTarget): boolean {
  const method = target.httpMethod?.toUpperCase() ?? null;
  return (
    target.kind === 'webhook' ||
    target.requiresAuth ||
    target.requiresTenant ||
    hasPersistenceDependency(target) ||
    Boolean(method && MUTATING_METHODS.has(method))
  );
}

function isObservedHarnessStatus(status: HarnessExecutionStatus): boolean {
  return status === 'passed' || status === 'failed' || status === 'blocked' || status === 'error';
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
  const route = target.routePattern || '';
  const method = target.httpMethod?.toUpperCase() ?? '';
  return (
    method === 'POST' &&
    (/\bwebhook\b/i.test(route) ||
      /\bcallback\b/i.test(route) ||
      /\bevent\b/i.test(route) ||
      /signature|x-hub|x-signature/i.test(target.name))
  );
}

function buildFullPath(controllerPath: string, methodPath: string): string {
  const cp = controllerPath.replace(/^\/|\/$/g, '');
  const mp = (methodPath || '').replace(/^\/|\/$/g, '');
  const full = mp ? `/${cp}/${mp}` : `/${cp}`;
  return full.replace(/\/+/g, '/');
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function countParenDelta(value: string): number {
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
    if (!SERVICE_ALIAS_IGNORE.has(match[2])) {
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
  if (NON_METHOD_NAMES.has(methodName)) {
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
      pendingMethod.parenDepth += countParenDelta(trimmed);
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

const PRISMA_ACCESS_PATTERNS = [
  /this\.(?:prisma|prismaAny)\.([a-z]\w+)\.\s*(?:create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany)\s*\(/g,
  /\(this\.prisma\s+as\s+[a][n][y]\)\.([a-z]\w+)\.\s*(?:create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany)\s*\(/g,
  /(?:prismaAny|prismaExt|prisma)\.([a-z]\w+)\.\s*(?:create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany)\s*\(/g,
  /[tT][xX]\.([a-z]\w+)\.\s*(?:create|findMany|findUnique|findFirst|update|updateMany|upsert|delete|deleteMany|count|aggregate|groupBy|createMany)\s*\(/g,
];

function collectPrismaModelsFromText(text: string): string[] {
  const models = new Set<string>();
  for (const pattern of PRISMA_ACCESS_PATTERNS) {
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
  const aliasKeys = [...aliases.keys()];

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

  for (const aliasName of aliasKeys) {
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
  const behaviorNodeMap = new Map<string, BehaviorNode>();
  if (behaviorGraph?.nodes) {
    for (const node of behaviorGraph.nodes) {
      behaviorNodeMap.set(`${node.filePath}:${node.name}`, node);
    }
  }

  // ── 3. Classify execution feasibility for every target ──
  for (const target of allTargets) {
    const classification = classifyExecutionFeasibility(target, behaviorNodeMap, rootDir);
    target.feasibility = classification.feasibility;
    target.feasibilityReason = classification.reason;
    target.generatedTests = [];
    target.generated = false;
  }

  // ── 4. Generate fixtures for every target ──
  for (const target of allTargets) {
    target.fixtures = generateFixturesForTarget(target, rootDir);
  }

  // ── 5. Generate test harness code for executable targets ──
  for (const target of allTargets) {
    if (target.feasibility === 'executable') {
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
    return {
      targetId: target.targetId,
      status: 'not_executed' as const,
      executionTimeMs: 0,
      attempts: 0,
      error: null,
      output: null,
      dbSideEffects: [],
      logEntries: [],
      startedAt: '',
      finishedAt: '',
    };
  });

  // ── 8. Compute critical target stats ──
  const criticalTargets = allTargets.filter(isCriticalHarnessTarget);

  const passedResults = combinedResults.filter((r) => r.status === 'passed');
  const failedResults = combinedResults.filter((r) => r.status === 'failed');
  const blockedResults = combinedResults.filter((r) => r.status === 'blocked');

  const feasibilitySummary = buildFeasibilitySummary(allTargets);

  const summary = {
    totalTargets: allTargets.length,
    plannedTargets: allTargets.filter((t) =>
      t.generatedTests.some((test) => test.status === 'planned'),
    ).length,
    notExecutedTargets: combinedResults.filter(
      (r) => r.status === 'planned' || r.status === 'not_executed' || r.status === 'not_tested',
    ).length,
    testedTargets: combinedResults.filter((r) => isObservedHarnessStatus(r.status)).length,
    passedTargets: passedResults.length,
    failedTargets: failedResults.length,
    blockedTargets: blockedResults.length,
    criticalTargets: criticalTargets.length,
    criticalTested: criticalTargets.filter((t) => {
      const r = combinedResults.find((rr) => rr.targetId === t.targetId);
      return r && isObservedHarnessStatus(r.status);
    }).length,
    criticalPassed: criticalTargets.filter((t) => {
      const r = combinedResults.find((rr) => rr.targetId === t.targetId);
      return r && r.status === 'passed';
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
    behaviorNodeCount: behaviorNodeMap.size,
  };

  // ── 9. Write artifact to disk ──
  const artifactAbsPath = safeJoin(rootDir, HARNESS_ARTIFACT_PATH);
  ensureDir(path.dirname(artifactAbsPath), { recursive: true });
  writeTextFile(artifactAbsPath, JSON.stringify(evidence, null, 2));

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
  const routes = parseBackendRoutes(config);

  return routes.map((route) => {
    const kind: HarnessTargetKind = TARGET_KIND_MAP[route.httpMethod] || 'endpoint';
    const normalizedPath = normalizeRoute(route.fullPath);
    const targetId = `endpoint:${route.httpMethod.toLowerCase()}:${camelToKebab(normalizedPath)}`;

    const requiresAuth = !route.isPublic && route.guards.length > 0;
    const requiresTenant = /workspace|tenant|org|:wid|:workspaceId/i.test(normalizedPath);

    return {
      targetId,
      kind,
      name: `${route.controllerPath}/${route.methodName}`,
      filePath: route.file,
      methodName: route.methodName,
      routePattern: normalizedPath,
      httpMethod: route.httpMethod,
      requiresAuth,
      requiresTenant,
      dependencies: route.serviceCalls.map((call) => {
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

      const dependencies = resolveDependencyNames(file, className, method.name);
      const depIds = dependencies.map((dep) => `service:${camelToKebab(dep.className)}`);

      const requiresAuth =
        /auth|permission|role|guard|authorize/i.test(method.name) ||
        /auth|permission|role|guard|authorize/i.test(className);

      const requiresTenant =
        /workspace|tenant/i.test(className) || /workspace|tenant/i.test(method.name);

      // Detect Prisma models accessed within the method body
      const methodRe = new RegExp(`\\b${method.name}\\s*(?:<[^>]+>)?\\s*\\(`);
      const methodMatch = content.match(methodRe);
      let prismaModels: string[] = [];
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
        prismaModels = collectPrismaModelsFromText(bodyText);
      }

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
        dependencies: unique(depIds),
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
 * Identifies webhook endpoints by matching route paths against webhook-related
 * keywords (e.g. "webhook", "stripe", "callback"). Each handler is registered
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
    required: true,
    generated: false,
  });

  // Auth token fixture — required when target requires authentication
  if (target.requiresAuth) {
    fixtures.push({
      kind: 'auth_token',
      name: 'pulse-auth-token',
      description: 'JWT auth token with test workspace permissions',
      data: { workspace: 'pulse-test-workspace', roles: ['admin', 'member'] },
      required: true,
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
      required: false,
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
          workspaceId: 'pulse-test-workspace',
          testMode: true,
          pulseRun: 'harness-discovery',
        },
      },
      required: true,
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
        event: 'pulse.test.event',
        timestamp: formatTimestamp(),
        data: { id: 'pulse-test-id', testMode: true },
      },
      required: true,
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
        required: true,
        generated: false,
      });
    }
  }

  return fixtures;
}

// ─── Behavior Graph Integration ────────────────────────────────────────────

const BEHAVIOR_GRAPH_ARTIFACT = '.pulse/current/PULSE_BEHAVIOR_GRAPH.json';

/**
 * Load the behavior graph artifact produced by behavior-graph.ts.
 *
 * Behavior nodes carry per-function analysis (inputs, outputs, state access,
 * external calls, risk level, execution mode) used to classify harness
 * targets for execution feasibility.
 */
export function readBehaviorGraph(rootDir: string): BehaviorGraph | null {
  const artifactPath = safeJoin(rootDir, BEHAVIOR_GRAPH_ARTIFACT);
  if (!pathExists(artifactPath)) {
    return null;
  }
  try {
    return readJsonFile<BehaviorGraph>(artifactPath);
  } catch {
    return null;
  }
}

// ─── Execution Feasibility Classification ────────────────────────────────────

const EXTERNAL_CALL_SHAPE_RE =
  /\b(?:fetch|axios|httpService|request)\s*(?:<[^>]*>)?\s*\(|\.(?:get|post|put|patch|delete)\s*\(\s*['"`]https?:\/\//i;
const INFRASTRUCTURE_BOUNDARY_SHAPE_RE =
  /@\s*(?:Processor|Process|Cron|OnQueue\w*)\b|\b(?:new\s+Queue|QueueEvents|EventEmitter|emit|publish|subscribe)\s*\(/i;
const DESTRUCTIVE_STATE_ACCESS_SHAPE_RE = /\.(?:delete|deleteMany|upsert)\s*\(/i;

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
  const targetKey = `${target.filePath}:${target.methodName ?? 'constructor'}`;

  // ── Check 1: no method means we cannot execute ──
  if (!target.methodName || target.methodName === 'constructor') {
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
  const behaviorNode = behaviorNodes.get(targetKey);

  // ── Check 3: behavior graph requires governed staging execution ──
  if (behaviorNode && behaviorNode.executionMode === 'human_required') {
    return {
      feasibility: 'needs_staging',
      reason: `Behavior graph requires governed staging execution for "${behaviorNode.name}" before this can become observed proof.`,
    };
  }

  // ── Check 4: external API calls ──
  if (behaviorNode?.externalCalls && behaviorNode.externalCalls.length > 0) {
    const providers = [...new Set(behaviorNode.externalCalls.map((c) => c.provider))];
    return {
      feasibility: 'needs_staging',
      reason: `Behavior graph detects external calls to: ${providers.join(', ')}`,
    };
  }

  const targetSource = rootDir ? readHarnessTargetSource(rootDir, target.filePath) : '';

  if (targetSource && EXTERNAL_CALL_SHAPE_RE.test(targetSource)) {
    return {
      feasibility: 'needs_staging',
      reason: 'Source contains an outbound HTTP call shape that requires network-controlled staging',
    };
  }

  // ── Check 5: queue/event infrastructure boundaries ──
  if (targetSource && INFRASTRUCTURE_BOUNDARY_SHAPE_RE.test(targetSource)) {
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
  if (targetSource && DESTRUCTIVE_STATE_ACCESS_SHAPE_RE.test(targetSource)) {
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

function readHarnessTargetSource(rootDir: string, filePath: string): string {
  const absolutePath = path.isAbsolute(filePath) ? filePath : safeJoin(rootDir, filePath);
  if (!pathExists(absolutePath)) {
    return '';
  }
  try {
    return readTextFile(absolutePath);
  } catch {
    return '';
  }
}

// ─── Test Harness Code Generation ────────────────────────────────────────────

/**
 * Generate test harness code for a given executable target.
 *
 * Produces a non-executed blueprint. The blueprint is deliberately not marked
 * runnable because fixture selection and assertions must be materialized from
 * real code behavior before this can become proof.
 */
export function generateTestHarnessCode(target: HarnessTarget): HarnessGeneratedTest[] {
  if (target.feasibility !== 'executable') {
    return [];
  }

  const suiteName = camelToKebab(target.name).replace(/\//g, '_');

  return [
    {
      testName: `[PULSE] ${suiteName} — planned executable harness`,
      status: 'planned',
      framework: target.httpMethod ? 'supertest' : 'jest',
      canRunLocally: false,
      code: buildHarnessBlueprintCode(target),
    },
  ];
}

function buildHarnessBlueprintCode(target: HarnessTarget): string {
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
    dependencies: target.dependencies,
    requiredFixtures: target.fixtures
      .filter((fixture) => fixture.required)
      .map((fixture) => ({
        kind: fixture.kind,
        name: fixture.name,
        description: fixture.description,
      })),
    requiredAssertions: [
      'materialize target import and dependency setup from the owning package',
      'bind fixtures to real constructors, HTTP app, queue, or database test adapter',
      'assert concrete output contract instead of defined/non-error placeholders',
      'assert auth, tenant, and side-effect isolation when target metadata requires it',
      'record attempts, timestamps, output, logs, and side effects before status can pass',
    ],
  };

  return [
    `const pulseHarnessBlueprint = ${JSON.stringify(blueprint, null, 2)};`,
    '',
    "throw new Error('PULSE_HARNESS_BLUEPRINT_NOT_EXECUTED: materialize fixtures and assertions before running this plan');",
  ].join('\n');
}

// ─── Fixture Data Structure Builders ─────────────────────────────────────────

/**
 * Build fixture data structures for common scenarios without connecting to
 * any real infrastructure. These are blueprint data definitions consumed by
 * test runners when they actually execute.
 */
export function buildFixtureDataStructures(targets: HarnessTarget[]): Record<string, unknown> {
  const dbModels = new Set<string>();
  const queueNames = new Set<string>();
  const webhookEndpoints: Array<{ path: string; targetId: string }> = [];

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
      webhookEndpoints.push({ path: t.routePattern, targetId: t.targetId });
    }
  }

  return {
    dbSeeds: [...dbModels].map((model) => ({
      model,
      table: camelToKebab(model),
      seedRecords: 5,
      defaultFields: { id: 'uuid-string', createdAt: 'Date', updatedAt: 'Date' },
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
      path: w.path,
      targetId: w.targetId,
      samplePayload: {
        event: 'pulse.test.event',
        timestamp: formatTimestamp(),
        data: { id: 'pulse-test-id', testMode: true },
      },
      signatureHeader: 'x-webhook-signature',
    })),
    authFixtures: {
      testTokenPayload: {
        sub: 'pulse-test-user',
        workspaceId: 'pulse-test-workspace',
        roles: ['admin', 'member'],
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
  let generatedTestCount = 0;

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
    generatedTestCount += t.generatedTests.length;
  }

  return { executableTargets, needsStagingTargets, cannotExecuteTargets, generatedTestCount };
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
  const artifactPath = safeJoin(rootDir, HARNESS_ARTIFACT_PATH);

  if (!pathExists(artifactPath)) {
    return [];
  }

  try {
    const evidence = readJsonFile<HarnessEvidence>(artifactPath);
    return Array.isArray(evidence.results)
      ? evidence.results.map(normalizeHarnessExecutionResult)
      : [];
  } catch {
    return [];
  }
}
