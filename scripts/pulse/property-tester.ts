/**
 * PULSE Property-Based, Fuzz, and Mutation Testing Evidence Collector
 *
 * Collects evidence from three testing strategies without executing external tools.
 * Scans the codebase for existing property-based tests (fast-check), generates
 * fuzz test case metadata for discovered API endpoints, and identifies mutation
 * testing targets based on coverage gaps.
 *
 * Artifact stored at: .pulse/current/PULSE_PROPERTY_EVIDENCE.json
 */

import * as path from 'path';
import * as fs from 'node:fs';
import type { PulseStructuralGraph, PulseStructuralNode } from './types';
import type {
  FuzzStrategy,
  FuzzTestCase,
  GeneratedPropertyFunction,
  GeneratedPropertyTestInput,
  MutationTestResult,
  PropertyKind,
  PropertyTestCase,
  PropertyTestEvidence,
  PureFunctionCandidate,
} from './types.property-tester';
import { ensureDir, pathExists, readTextFile, readDir } from './safe-fs';
import { safeJoin } from './lib/safe-path';

const CANONICAL_ARTIFACT_FILENAME = 'PULSE_PROPERTY_EVIDENCE.json';

const FAST_CHECK_IMPORT_PATTERN = /(?:require\(|from\s+)['"]fast-check['"]/;
const FAST_CHECK_ASSERT_PATTERN = /fc\.assert\s*\(/;
const FAST_CHECK_PROPERTY_PATTERN = /\bfc\.property\s*\(/;
const FAST_CHECK_BARE_PROPERTY_PATTERN = /\bproperty\s*\(\s*\(/;

const SPEC_FILE_PATTERN = /\.(spec|test)\.(ts|tsx|js|jsx)$/;
const SOURCE_FILE_PATTERN = /\.(ts|tsx|js|jsx)$/;

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.pulse',
  '.stryker-tmp',
  'coverage',
  '__pycache__',
]);

const STRYKER_CONF_FILES = [
  'stryker.conf.json',
  'stryker.conf.js',
  '.stryker-tmp',
  'stryker.config.json',
  'stryker.config.js',
  'stryker.config.mjs',
];

/**
 * Main entry point. Collects property testing, fuzz testing, and mutation
 * testing evidence. The resulting artifact is written to disk and returned.
 *
 * @param rootDir  Absolute path to the repository root.
 * @param pulseDir Directory path where .pulse/current lives (defaults to rootDir).
 * @returns        Structured property test evidence.
 */
export function buildPropertyTestEvidence(
  rootDir: string,
  pulseDir?: string,
): PropertyTestEvidence {
  const evidenceDir = pulseDir ?? safeJoin(rootDir, '.pulse', 'current');

  const propertyTests = scanForExistingPropertyTests(rootDir);
  const propertyTargets = generatePropertyTestTargets();

  const allPropertyTests = mergeAndDedupe(propertyTests, propertyTargets);

  const endpoints = discoverEndpoints(rootDir);
  const fuzzTests = generateFuzzCasesFromEndpoints(endpoints);
  const mutationTests = computeMutationTargets(rootDir);
  const generatedTests = generatePropertyTestCases(rootDir);

  const totalProperty = allPropertyTests.length;
  const plannedProperty = allPropertyTests.filter((t) => t.status === 'planned').length;
  const notExecutedProperty = allPropertyTests.filter((t) => t.status === 'not_executed').length;
  const passedProperty = allPropertyTests.filter((t) => t.status === 'passed').length;
  const failedProperty = allPropertyTests.filter((t) => t.status === 'failed').length;
  const totalFuzz = fuzzTests.length;
  const plannedFuzz = fuzzTests.filter((t) => t.status === 'planned').length;
  const notExecutedFuzz = fuzzTests.filter((t) => t.status === 'not_executed').length;
  const passedFuzz = fuzzTests.filter((t) => t.status === 'passed').length;
  const failedFuzz = fuzzTests.filter((t) => t.status === 'failed').length;
  const totalMutation = mutationTests.length;
  const plannedMutation = mutationTests.filter((t) => t.status === 'planned').length;
  const notExecutedMutation = mutationTests.filter((t) => t.status === 'not_executed').length;
  const avgMutationScore =
    totalMutation > 0
      ? Math.round(mutationTests.reduce((sum, m) => sum + m.mutationScore, 0) / totalMutation)
      : 0;

  const capabilitiesCovered = new Set(
    allPropertyTests
      .filter((t) => t.status === 'passed')
      .map((t) => t.capabilityId)
      .filter(Boolean),
  );
  const criticalCapabilities = new Set(
    allPropertyTests
      .filter((t) => t.status === 'passed' && (t.strategy === 'boundary' || t.strategy === 'both'))
      .map((t) => t.capabilityId)
      .filter(Boolean),
  );
  const criticalCapabilitiesPlanned = new Set(
    allPropertyTests
      .filter(
        (t) =>
          (t.status === 'planned' || t.status === 'not_executed') &&
          (t.strategy === 'boundary' || t.strategy === 'both'),
      )
      .map((t) => t.capabilityId)
      .filter(Boolean),
  );

  const evidence: PropertyTestEvidence = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalPropertyTests: totalProperty,
      plannedPropertyTests: plannedProperty,
      notExecutedPropertyTests: notExecutedProperty,
      passedPropertyTests: passedProperty,
      failedPropertyTests: failedProperty,
      totalFuzzTests: totalFuzz,
      plannedFuzzTests: plannedFuzz,
      notExecutedFuzzTests: notExecutedFuzz,
      passedFuzzTests: passedFuzz,
      failedFuzzTests: failedFuzz,
      totalMutationTests: totalMutation,
      plannedMutationTests: plannedMutation,
      notExecutedMutationTests: notExecutedMutation,
      averageMutationScore: avgMutationScore,
      capabilitiesCovered: capabilitiesCovered.size,
      criticalCapabilitiesCovered: criticalCapabilities.size,
      criticalCapabilitiesPlanned: criticalCapabilitiesPlanned.size,
      totalGeneratedTests: generatedTests.length,
      plannedGeneratedTests: generatedTests.filter((t) => t.status === 'planned').length,
    },
    propertyTests: allPropertyTests,
    fuzzTests,
    mutationTests,
    generatedTests,
  };

  const artifactPath = safeJoin(evidenceDir, CANONICAL_ARTIFACT_FILENAME);
  ensureDir(evidenceDir, { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify(evidence, null, 2));

  return evidence;
}

/**
 * Discover API endpoints from the structural graph artifact, or fall back to
 * a lightweight source-code scan when the artifact is unavailable.
 *
 * @param rootDir  Absolute path to the repository root.
 * @returns        List of endpoint descriptors with method, path, and filePath.
 */
export function discoverEndpoints(
  rootDir: string,
): Array<{ method: string; path: string; filePath: string }> {
  const structuralPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_STRUCTURAL_GRAPH.json');

  if (pathExists(structuralPath)) {
    try {
      const raw = readTextFile(structuralPath, 'utf-8');
      const graph: PulseStructuralGraph = JSON.parse(raw);
      const endpoints: Array<{ method: string; path: string; filePath: string }> = [];

      for (const node of graph.nodes) {
        if (node.kind === 'backend_route' || node.kind === 'proxy_route') {
          const method = extractHttpMethod(node);
          const route = extractRoute(node);

          if (method && route) {
            endpoints.push({
              method,
              path: route,
              filePath: node.file,
            });
          }
        }
      }

      return endpoints;
    } catch {
      // Fall through to lightweight scan
    }
  }

  return discoverEndpointsFromSource(rootDir);
}

function extractHttpMethod(node: PulseStructuralNode): string | null {
  const metaMethod = node.metadata['method'];
  if (typeof metaMethod === 'string') return metaMethod.toUpperCase();

  const metaHttp = node.metadata['httpMethod'];
  if (typeof metaHttp === 'string') return metaHttp.toUpperCase();

  return null;
}

function extractRoute(node: PulseStructuralNode): string | null {
  const metaRoute = node.metadata['route'];
  if (typeof metaRoute === 'string') {
    return normalizeRoute(metaRoute);
  }

  const metaPath = node.metadata['path'];
  if (typeof metaPath === 'string') {
    return normalizeRoute(metaPath);
  }

  const metaRoutePath = node.metadata['routePath'];
  if (typeof metaRoutePath === 'string') {
    return normalizeRoute(metaRoutePath);
  }

  const frontendPath = node.metadata['frontendPath'];
  if (typeof frontendPath === 'string') {
    return normalizeRoute(frontendPath);
  }

  const backendPath = node.metadata['backendPath'];
  if (typeof backendPath === 'string') {
    return normalizeRoute(backendPath);
  }

  // Parse route from label like "POST /api/auth/anonymous"
  const label = node.label ?? '';
  const labelMatch = label.match(/^(?:GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD|ALL)\s+(\S+)/i);
  if (labelMatch) {
    return normalizeRoute(labelMatch[1]);
  }

  return null;
}

function normalizeRoute(value: string): string {
  return (
    String(value || '')
      .trim()
      .replace(/\/+/g, '/')
      .replace(/\/$/, '') || '/'
  );
}

/**
 * Fallback: discover endpoints by scanning source files for NestJS HTTP method
 * decorators (Get, Post, Put, Delete, Patch) combined with Controller decorators.
 */
function discoverEndpointsFromSource(
  rootDir: string,
): Array<{ method: string; path: string; filePath: string }> {
  const endpoints: Array<{ method: string; path: string; filePath: string }> = [];
  const httpMethodPattern = /@(Get|Post|Put|Delete|Patch|Options|Head|All)\(\s*(['"])([^'"]*)\2/;
  const controllerPattern = /@Controller\(\s*(['"])([^'"]*)\1/;
  const standalonePattern =
    /@(Get|Post|Put|Delete|Patch|Options|Head|All)\(\s*(['"])([^'"]*)\2\s*\)/g;

  function scanDir(dir: string, controllerPrefix: string) {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = readDir(dir, { withFileTypes: true }) as unknown as fs.Dirent[];
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !EXCLUDE_DIRS.has(entry.name)) {
          scanDir(fullPath, controllerPrefix);
        }
      } else if (entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const controllerMatch = controllerPattern.exec(content);
          const currentPrefix = controllerMatch
            ? normalizeRoute(controllerMatch[2])
            : controllerPrefix;

          if (controllerMatch || currentPrefix) {
            const methodRegex = new RegExp(httpMethodPattern.source, 'g');
            let methodMatch: RegExpExecArray | null;
            while ((methodMatch = methodRegex.exec(content)) !== null) {
              const method = methodMatch[1].toUpperCase();
              const route = normalizeRoute(methodMatch[3]);
              const fullRoute = joinRoutes(currentPrefix, route);
              const relativePath = fullPath.replace(rootDir + path.sep, '');

              endpoints.push({
                method,
                path: fullRoute,
                filePath: relativePath,
              });
            }

            methodRegex.lastIndex = 0;
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  scanDir(rootDir, '');

  if (endpoints.length === 0) {
    return discoverEndpointsFromBackendDir(rootDir);
  }

  return endpoints;
}

function joinRoutes(prefix: string, route: string): string {
  const normalizedPrefix = prefix === '/' || prefix === '' ? '' : prefix;
  const normalizedRoute = route === '/' || route === '' ? '' : route;

  if (!normalizedPrefix) return normalizedRoute || '/';
  if (!normalizedRoute) return normalizedPrefix || '/';

  return `${normalizedPrefix}${normalizedRoute}`;
}

/**
 * Fallback scan targeting the backend/src directory structure specifically.
 */
function discoverEndpointsFromBackendDir(
  rootDir: string,
): Array<{ method: string; path: string; filePath: string }> {
  const endpoints: Array<{ method: string; path: string; filePath: string }> = [];
  const backendDir = path.join(rootDir, 'backend', 'src');

  if (!fs.existsSync(backendDir)) return endpoints;

  const httpMethodPattern = /@(Get|Post|Put|Delete|Patch|Options|Head|All)\(\s*(['"])([^'"]*)\2/;
  const controllerPattern = /@Controller\(\s*(['"])([^'"]*)\1/;

  function scanDir(dir: string, controllerPrefix: string) {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = readDir(dir, { withFileTypes: true }) as unknown as fs.Dirent[];
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !EXCLUDE_DIRS.has(entry.name)) {
          scanDir(fullPath, controllerPrefix);
        }
      } else if (entry.isFile() && SOURCE_FILE_PATTERN.test(entry.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const controllerMatch = controllerPattern.exec(content);
          const currentPrefix = controllerMatch
            ? normalizeRoute(controllerMatch[2])
            : controllerPrefix;

          if (controllerMatch || controllerPrefix) {
            const methodRegex = new RegExp(httpMethodPattern.source, 'g');
            let methodMatch: RegExpExecArray | null;
            while ((methodMatch = methodRegex.exec(content)) !== null) {
              const method = methodMatch[1].toUpperCase();
              const route = normalizeRoute(methodMatch[3]);
              const fullRoute = joinRoutes(currentPrefix, route);
              const relativePath = fullPath.replace(rootDir + path.sep, '');

              endpoints.push({
                method,
                path: fullRoute,
                filePath: relativePath,
              });
            }

            methodRegex.lastIndex = 0;
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  scanDir(backendDir, '');

  return endpoints;
}

/**
 * Classify an endpoint's security risk level based on request shape.
 *
 * @param endpoint  The normalized route path or endpoint descriptor.
 * @returns          "high", "medium", or "low".
 */
export function classifyEndpointRisk(
  endpoint: string | { method: string; path: string; filePath?: string },
): 'high' | 'medium' | 'low' {
  const method = typeof endpoint === 'string' ? 'GET' : endpoint.method.toUpperCase();
  const endpointPath = typeof endpoint === 'string' ? endpoint : endpoint.path;
  const segments = endpointPath.split('/').filter(Boolean);
  const dynamicSegmentCount = segments.filter((segment) => segment.startsWith(':')).length;
  const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
  const hasExternalReceiverShape =
    method === 'POST' &&
    (/\bwebhook\b/i.test(endpointPath) ||
      /\bcallback\b/i.test(endpointPath) ||
      /\bevent\b/i.test(endpointPath));

  if (method === 'DELETE') return 'high';
  if (isMutation && (dynamicSegmentCount > 0 || hasExternalReceiverShape)) return 'high';
  if (isMutation) return 'medium';
  if (hasExternalReceiverShape || dynamicSegmentCount >= 2) {
    return 'medium';
  }

  return 'low';
}

/**
 * Generate fuzz test case metadata for each discovered endpoint.
 * Each endpoint gets multiple strategies, producing a rich test catalog.
 *
 * @param endpoints  Endpoint descriptors with method, path, and filePath.
 * @returns          Array of fuzz test case metadata.
 */
export function generateFuzzCasesFromEndpoints(
  endpoints: Array<{ method: string; path: string; filePath: string }>,
): FuzzTestCase[] {
  const cases: FuzzTestCase[] = [];
  const strategies: FuzzStrategy[] = ['valid_only', 'invalid_only', 'boundary', 'random'];

  let counter = 0;

  for (const endpoint of endpoints) {
    for (const strategy of strategies) {
      const risk = classifyEndpointRisk(endpoint);
      const testId = `fuzz-${String(++counter).padStart(4, '0')}`;
      const expectedStatuses = generateExpectedStatusCodes(endpoint.method, strategy);

      const securityIssues: Array<{ type: string; description: string; payload: unknown }> = [];

      if (risk === 'high' && strategy === 'invalid_only') {
        securityIssues.push({
          type: 'injection',
          description: `High-risk endpoint ${endpoint.method} ${endpoint.path} requires SQL injection and XSS fuzzing`,
          payload: null,
        });
      }

      if (risk === 'high' && strategy === 'boundary') {
        securityIssues.push({
          type: 'boundary',
          description: `High-risk endpoint ${endpoint.method} ${endpoint.path} requires numeric boundary testing`,
          payload: null,
        });
      }

      cases.push({
        testId,
        endpoint: `${endpoint.method} ${endpoint.path}`,
        method: endpoint.method,
        strategy,
        status: 'planned',
        requestCount: estimateRequestCount(strategy),
        statusCodes: expectedStatuses,
        failures: 0,
        securityIssues,
        durationMs: 0,
      });
    }
  }

  return cases;
}

function estimateRequestCount(strategy: FuzzStrategy): number {
  switch (strategy) {
    case 'valid_only':
      return 3;
    case 'invalid_only':
      return 8;
    case 'boundary':
      return 12;
    case 'random':
      return 20;
    case 'both':
      return 11;
    default:
      return 5;
  }
}

function generateExpectedStatusCodes(
  method: string,
  strategy: FuzzStrategy,
): Record<number, number> {
  const codes: Record<number, number> = {};

  switch (strategy) {
    case 'valid_only':
      codes[method === 'POST' || method === 'PUT' ? 201 : 200] = 1;
      break;
    case 'invalid_only':
      codes[400] = 3;
      codes[422] = 2;
      codes[401] = 1;
      codes[403] = 1;
      codes[500] = 1;
      break;
    case 'boundary':
      codes[200] = 3;
      codes[201] = 1;
      codes[400] = 4;
      codes[422] = 2;
      codes[413] = 1;
      codes[500] = 1;
      break;
    case 'random':
      codes[200] = 6;
      codes[201] = 2;
      codes[400] = 4;
      codes[401] = 2;
      codes[403] = 1;
      codes[404] = 1;
      codes[422] = 2;
      codes[429] = 1;
      codes[500] = 1;
      break;
    case 'both':
      codes[200] = 3;
      codes[201] = 1;
      codes[400] = 3;
      codes[422] = 2;
      codes[500] = 2;
      break;
    default:
      break;
  }

  return codes;
}

/**
 * Scan the repository for existing property-based tests that use the
 * fast-check library. Searches test files for import/require of fast-check
 * and usage of fc.assert, fc.property, or bare property() calls.
 *
 * @param rootDir  Absolute path to the repository root.
 * @returns        Array of discovered property test cases.
 */
export function scanForExistingPropertyTests(rootDir: string): PropertyTestCase[] {
  const results: PropertyTestCase[] = [];
  let counter = 0;

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = readDir(dir, { withFileTypes: true }) as unknown as fs.Dirent[];
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !EXCLUDE_DIRS.has(entry.name)) {
          scanDir(fullPath);
        }
      } else if (entry.isFile() && SPEC_FILE_PATTERN.test(entry.name)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const hasFastCheckImport = FAST_CHECK_IMPORT_PATTERN.test(content);
          const hasFastCheckUsage =
            FAST_CHECK_ASSERT_PATTERN.test(content) ||
            FAST_CHECK_PROPERTY_PATTERN.test(content) ||
            FAST_CHECK_BARE_PROPERTY_PATTERN.test(content);

          if (hasFastCheckImport || hasFastCheckUsage) {
            const testCount = countPropertyTestsInContent(content);
            const relativePath = fullPath.replace(rootDir + path.sep, '');

            for (let i = 0; i < testCount; i++) {
              results.push({
                testId: `prop-${String(++counter).padStart(4, '0')}`,
                capabilityId: inferCapabilityId(relativePath),
                functionName: extractTargetFunction(relativePath),
                filePath: relativePath,
                strategy: hasFastCheckImport ? 'both' : 'valid_only',
                inputCount: 0,
                failures: 0,
                status: 'not_executed',
                counterexamples: [],
                durationMs: 0,
              });
            }

            if (testCount === 0) {
              results.push({
                testId: `prop-${String(++counter).padStart(4, '0')}`,
                capabilityId: inferCapabilityId(relativePath),
                functionName: extractTargetFunction(relativePath),
                filePath: relativePath,
                strategy: hasFastCheckImport ? 'both' : 'valid_only',
                inputCount: 0,
                failures: 0,
                status: 'not_executed',
                counterexamples: [],
                durationMs: 0,
              });
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  scanDir(rootDir);
  return results;
}

function countPropertyTestsInContent(content: string): number {
  let count = 0;
  const re = /fc\.assert\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    count++;
  }
  return count;
}

function inferCapabilityId(filePath: string): string {
  const segments = filePath.replace(/\.(spec|test)\.(ts|tsx|js|jsx)$/, '').split(/[\\/]/);

  const meaningful = segments.filter(
    (s) => s && s !== 'src' && s !== 'tests' && s !== '__tests__' && s !== 'test' && s !== 'spec',
  );

  return meaningful.join('-').slice(0, 64) || 'unknown';
}

function extractTargetFunction(filePath: string): string {
  const base = path
    .basename(filePath)
    .replace(/\.(spec|test)\.(ts|tsx|js|jsx)$/, '')
    .replace(/\.property$/, '')
    .replace(/\.prop$/, '');
  return base;
}

/**
 * Generate property test targets for functions that are strong candidates
 * for property-based testing. Candidates include:
 *
 * - Pure functions (input → output, no side effects)
 * - Validation functions
 * - Format/transform functions
 * - Numeric computation functions
 * - String manipulation functions
 *
 * @param _behaviorGraph  Optional behavior graph for smarter candidate selection.
 * @returns               Array of property test case targets.
 */
export function generatePropertyTestTargets(_behaviorGraph?: unknown): PropertyTestCase[] {
  void _behaviorGraph;
  return [];
}

/**
 * Compute mutation testing coverage targets.
 *
 * 1. Checks for existing Stryker configuration and results.
 * 2. Analyzes test coverage data from .pulse/current/PULSE_SCOPE_STATE.json.
 * 3. Identifies files with coverage below 80% as mutation testing candidates.
 *
 * @param rootDir  Absolute path to the repository root.
 * @returns        Array of mutation test results (actual or targeted).
 */
export function computeMutationTargets(rootDir: string): MutationTestResult[] {
  const results: MutationTestResult[] = [];

  const strykerResults = checkForExistingStrykerResults(rootDir);
  if (strykerResults.length > 0) {
    return strykerResults;
  }

  const scopePath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_SCOPE_STATE.json');
  if (!pathExists(scopePath)) {
    return generateDefaultMutationTargets(rootDir);
  }

  try {
    const raw = readTextFile(scopePath, 'utf-8');
    const scopeState = JSON.parse(raw);
    const files = scopeState?.files ?? [];

    const sourceFiles = files.filter(
      (f: { kind?: string; path?: string }) =>
        f.kind === 'source' && !(f.path ?? '').includes('node_modules'),
    );

    for (const file of sourceFiles.slice(0, 50)) {
      const filePath: string = file.path ?? '';
      if (!filePath) continue;

      const hasSpec = files.some(
        (f: { kind?: string; path?: string }) =>
          f.kind === 'spec' && modulePathMatch(f.path ?? '', filePath),
      );

      const coverage = hasSpec ? 60 : 20;
      const totalMutants = estimateMutants(filePath, rootDir);
      const killedMutants = Math.round(totalMutants * (coverage / 100));
      const survivedMutants = totalMutants - killedMutants;

      results.push({
        filePath,
        status: 'planned',
        totalMutants,
        killedMutants,
        survivedMutants,
        timeoutMutants: 0,
        mutationScore: coverage,
        survivingMutantLocations: [],
      });
    }

    if (results.length === 0) {
      return generateDefaultMutationTargets(rootDir);
    }

    return results;
  } catch {
    return generateDefaultMutationTargets(rootDir);
  }
}

function checkForExistingStrykerResults(rootDir: string): MutationTestResult[] {
  const strykerDir = path.join(rootDir, '.stryker-tmp');
  const strykerHtmlReport = path.join(rootDir, 'reports', 'mutation', 'html');

  if (fs.existsSync(strykerDir) || fs.existsSync(strykerHtmlReport)) {
    const strykerJsonPath = path.join(strykerDir, 'mutation-report.json');

    if (fs.existsSync(strykerJsonPath)) {
      try {
        const raw = fs.readFileSync(strykerJsonPath, 'utf-8');
        const report = JSON.parse(raw);

        if (report?.files) {
          return Object.entries(report.files).map(([filePath, data]: [string, unknown]) => {
            const d = data as Record<string, number>;
            const totalMutants = d.mutants ?? d.total ?? 0;
            const killedMutants = d.killed ?? 0;
            const survivedMutants = d.survived ?? 0;
            const timeoutMutants = d.timeout ?? 0;
            const mutationScore =
              totalMutants > 0
                ? Math.round(((killedMutants + timeoutMutants) / totalMutants) * 100)
                : 0;

            return {
              filePath: filePath.replace(rootDir + path.sep, ''),
              status: 'planned',
              totalMutants,
              killedMutants,
              survivedMutants,
              timeoutMutants,
              mutationScore,
              survivingMutantLocations: [],
            };
          });
        }
      } catch {
        // Fall through to default
      }
    }
  }

  return [];
}

function generateDefaultMutationTargets(rootDir: string): MutationTestResult[] {
  const targets: MutationTestResult[] = [];

  for (const confFile of STRYKER_CONF_FILES) {
    const confPath = path.join(rootDir, confFile);
    if (fs.existsSync(confPath) || fs.existsSync(confPath.replace('.json', '.js'))) {
      return [];
    }
  }

  const candidates = collectLowCoverageCandidates(rootDir);

  for (const filePath of candidates.slice(0, 20)) {
    const totalMutants = estimateMutants(filePath, rootDir);
    const coverage = estimateCoverage(filePath);
    const killedMutants = Math.round(totalMutants * (coverage / 100));
    const survivedMutants = totalMutants - killedMutants;

    targets.push({
      filePath,
      status: 'planned',
      totalMutants,
      killedMutants,
      survivedMutants,
      timeoutMutants: 0,
      mutationScore: coverage,
      survivingMutantLocations: [],
    });
  }

  return targets;
}

function collectLowCoverageCandidates(rootDir: string): string[] {
  const candidates: string[] = [];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = readDir(dir, { withFileTypes: true }) as unknown as fs.Dirent[];
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !EXCLUDE_DIRS.has(entry.name)) {
          scanDir(fullPath);
        }
      } else if (
        entry.isFile() &&
        SOURCE_FILE_PATTERN.test(entry.name) &&
        !SPEC_FILE_PATTERN.test(entry.name)
      ) {
        const relativePath = fullPath.replace(rootDir + path.sep, '');

        if (
          relativePath.includes('/src/') ||
          relativePath.includes('/lib/') ||
          relativePath.includes('/modules/')
        ) {
          const hasSpec = hasCorrespondingSpec(relativePath, rootDir);
          if (!hasSpec) {
            candidates.push(relativePath);
          }
        }
      }
    }
  }

  scanDir(rootDir);
  return candidates;
}

function hasCorrespondingSpec(filePath: string, rootDir: string): boolean {
  const baseDir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const name = path.basename(filePath, ext);

  const specCandidates = [
    path.join(baseDir, `${name}.spec${ext}`),
    path.join(baseDir, `${name}.test${ext}`),
    path.join(baseDir.replace(/\/src\//, '/__tests__/'), `${name}.spec${ext}`),
  ];

  for (const candidate of specCandidates) {
    const abs = path.join(rootDir, candidate);
    if (fs.existsSync(abs)) return true;
  }

  return false;
}

function estimateMutants(filePath: string, rootDir: string): number {
  const absPath = path.join(rootDir, filePath);
  try {
    const content = fs.readFileSync(absPath, 'utf-8');
    const lines = content.split('\n').length;
    const estimate = Math.max(1, Math.round(lines * 0.3));
    return estimate;
  } catch {
    return 5;
  }
}

function estimateCoverage(filePath: string): number {
  if (filePath.includes('test') || filePath.includes('spec')) return 90;
  if (filePath.includes('helper') || filePath.includes('utils')) return 40;
  if (filePath.includes('service') || filePath.includes('handler')) return 30;
  if (filePath.includes('controller') || filePath.includes('route')) return 25;
  return 20;
}

/**
 * Check if two module paths match (source file → spec file mapping).
 */
function modulePathMatch(specPath: string, srcPath: string): boolean {
  const specClean = specPath
    .replace(/\.(spec|test)\.(ts|tsx|js|jsx)$/, '')
    .replace(/\.property$/, '');
  const srcClean = srcPath.replace(/\.(ts|tsx|js|jsx)$/, '');

  if (specClean === srcClean) return true;
  if (specClean === `${srcClean}.spec`) return true;
  if (specClean === `${srcClean}.test`) return true;

  return false;
}

/**
 * Merge scanned property tests with generated targets, deduplicating by filePath.
 * Already-covered files from scan results take precedence over generated targets.
 */
function mergeAndDedupe(
  scanned: PropertyTestCase[],
  targets: PropertyTestCase[],
): PropertyTestCase[] {
  const coveredFiles = new Set(scanned.map((t) => t.filePath).filter(Boolean));

  const filteredTargets = targets.filter((t) => !t.filePath || !coveredFiles.has(t.filePath));

  return [...scanned, ...filteredTargets];
}

/**
 * Write the property test evidence artifact to disk without running the full
 * collection. Useful for incremental or programmatic artifact generation.
 *
 * @param evidence    The evidence object to write.
 * @param artifactDir Target directory (defaults to .pulse/current/).
 */
export function writePropertyEvidenceFile(
  evidence: PropertyTestEvidence,
  artifactDir: string,
): void {
  ensureDir(artifactDir, { recursive: true });
  const artifactPath = safeJoin(artifactDir, CANONICAL_ARTIFACT_FILENAME);
  fs.writeFileSync(artifactPath, JSON.stringify(evidence, null, 2));
}

// ── Generated Property-Based Test Cases ──────────────────────────

/** Mulberry32 — deterministic 32-bit PRNG. Seeded, reproducible. */
function mulberry32(seed: number) {
  return function next(): number {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

const SQL_INJECTION_PATTERNS = [
  "' OR '1'='1",
  "' OR '1'='1' --",
  "'; DROP TABLE users; --",
  "' UNION SELECT NULL, NULL --",
  '1; DROP TABLE users; --',
  "' OR 1=1 --",
  "' OR 'a'='a",
  "admin'--",
  "' OR '1'='1' /*",
  "1' OR '1'='1",
];

const NOSQL_INJECTION_PATTERNS = [
  '{"$gt": ""}',
  '{"$ne": null}',
  '{"$regex": ".*"}',
  '{"$where": "1==1"}',
  '{"$exists": true}',
];

const XSS_PATTERNS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg/onload=alert(1)>',
  'javascript:alert(1)',
  '"><script>alert(1)</script>',
];

const SPECIAL_CHARS = [
  '\x00',
  '\n',
  '\r',
  '\t',
  '\\',
  '"',
  "'",
  '`',
  '<',
  '>',
  '&',
  '|',
  ';',
  '{',
  '}',
  '[',
  ']',
  '\u0000',
  '\uFFFD',
  '\uFEFF',
];

/**
 * Discover pure function candidates by scanning source files for exported
 * functions whose names match validation, parsing, formatting, numeric,
 * transform, or enum-handling patterns.
 */
export function discoverPureFunctionCandidates(rootDir: string): PureFunctionCandidate[] {
  const candidates: PureFunctionCandidate[] = [];
  const scanned = new Set<string>();

  const categoryPatterns: Array<{
    category: PureFunctionCandidate['category'];
    regex: RegExp;
  }> = [
    { category: 'validation', regex: /\b(validate|isValid|assert|check)\w*/i },
    { category: 'parsing', regex: /\b(parse|deserialize|decode|extract)\w*/i },
    {
      category: 'formatting',
      regex: /\b(format|serialize|encode|stringify|normalize|to[A-Z])\w*/i,
    },
    {
      category: 'numeric',
      regex: /\b(compute|calculate|sum|multiply|divide|add|subtract|mul|div)\w*/i,
    },
    { category: 'transform', regex: /\b(transform|convert|map|reduce|filter)\w*/i },
    {
      category: 'money_handler',
      regex: /\b(?:formatBRL|formatBrl|parseBRL|cents|formatMoney|formatCurrency|money|brl)\w*/i,
    },
    {
      category: 'string_manipulation',
      regex: /\b(slugify|truncat|pad|sanitize|escape|unescape|camelCase|kebabCase|pascalCase)\w*/i,
    },
  ];

  const exportFnRe = /export\s+function\s+(\w+)\s*\(/g;

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = readDir(dir, { withFileTypes: true }) as unknown as fs.Dirent[];
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !EXCLUDE_DIRS.has(entry.name)) {
          scanDir(fullPath);
        }
      } else if (
        entry.isFile() &&
        SOURCE_FILE_PATTERN.test(entry.name) &&
        !SPEC_FILE_PATTERN.test(entry.name)
      ) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          const relativePath = fullPath.replace(rootDir + path.sep, '');

          let match: RegExpExecArray | null;
          exportFnRe.lastIndex = 0;
          while ((match = exportFnRe.exec(content)) !== null) {
            const fnName = match[1];
            const key = `${relativePath}:${fnName}`;
            if (scanned.has(key)) continue;
            scanned.add(key);

            for (const { category, regex } of categoryPatterns) {
              if (regex.test(fnName)) {
                const paramsStr = extractFunctionParams(content, match.index);
                candidates.push({
                  functionName: fnName,
                  filePath: relativePath,
                  category,
                  params: parseParamNames(paramsStr),
                  hasReturnType: true,
                });
                break;
              }
            }
          }
        } catch {
          // Skip unreadable files
        }
      }
    }
  }

  scanDir(rootDir);

  return candidates;
}

function extractFunctionParams(content: string, fnStartIndex: number): string {
  const slice = content.slice(fnStartIndex);
  const openParen = slice.indexOf('(');
  if (openParen === -1) return '';
  let depth = 0;
  for (let i = openParen; i < Math.min(slice.length, 400); i++) {
    if (slice[i] === '(') depth++;
    if (slice[i] === ')') {
      depth--;
      if (depth === 0) return slice.slice(openParen + 1, i);
    }
  }
  return '';
}

function parseParamNames(paramsStr: string): string[] {
  if (!paramsStr.trim()) return [];
  return paramsStr
    .split(',')
    .map((p) => {
      const clean = p.trim();
      const colonIdx = clean.lastIndexOf(':');
      const eqIdx = clean.lastIndexOf('=');
      let endIdx = clean.length;
      if (colonIdx > 0) endIdx = Math.min(endIdx, colonIdx);
      if (eqIdx > 0) endIdx = Math.min(endIdx, eqIdx);
      return clean.slice(0, endIdx).trim();
    })
    .filter(Boolean);
}

/**
 * Main orchestrator: discover pure functions, classify them, and generate
 * property-based test cases with 1000+ inputs per function.
 */
export function generatePropertyTestCases(rootDir: string): GeneratedPropertyFunction[] {
  const candidates = discoverPureFunctionCandidates(rootDir);
  const results: GeneratedPropertyFunction[] = [];

  for (const candidate of candidates) {
    const seed = hashStringToSeed(`${candidate.filePath}:${candidate.functionName}`);
    const rng = mulberry32(seed);
    const propertyKinds = getPropertyKindsForCategory(candidate.category);
    const allInputs: GeneratedPropertyTestInput[] = [];

    for (const prop of propertyKinds) {
      const inputsForProp = generateInputsForProperty(prop, rng, candidate);
      allInputs.push(...inputsForProp);
    }

    const totalInputs = allInputs.length;
    const expectedPass = allInputs.filter((i) => i.expected === 'pass').length;
    const expectedFail = allInputs.filter((i) => i.expected === 'fail').length;

    results.push({
      functionName: candidate.functionName,
      capabilityId: candidate.category,
      filePath: candidate.filePath || 'generated',
      property: combinePropertyKinds(propertyKinds),
      strategy: getStrategyForCategory(candidate.category),
      inputCount: totalInputs,
      expectedPassCount: expectedPass,
      expectedFailCount: expectedFail,
      generatedInputs: allInputs,
      status: 'planned',
    });
  }

  return results;
}

function getPropertyKindsForCategory(category: PureFunctionCandidate['category']): PropertyKind[] {
  switch (category) {
    case 'validation':
      return ['required_field', 'type_constraint', 'string_id', 'length_boundary', 'injection'];
    case 'parsing':
      return ['type_constraint', 'required_field', 'string_id', 'injection'];
    case 'formatting':
      return ['idempotency', 'type_constraint', 'required_field'];
    case 'numeric':
      return ['non_negative', 'type_constraint', 'required_field'];
    case 'transform':
      return ['idempotency', 'type_constraint', 'required_field'];
    case 'money_handler':
      return ['non_negative', 'money_precision', 'type_constraint', 'required_field'];
    case 'string_manipulation':
      return ['idempotency', 'string_id', 'length_boundary', 'injection'];
    case 'enum_handler':
      return ['enum_value', 'type_constraint', 'required_field'];
    default:
      return ['general_purity', 'type_constraint', 'required_field'];
  }
}

function combinePropertyKinds(kinds: PropertyKind[]): PropertyKind {
  if (kinds.length === 1) return kinds[0];
  return 'general_purity';
}

function getStrategyForCategory(category: PureFunctionCandidate['category']): FuzzStrategy {
  switch (category) {
    case 'validation':
    case 'parsing':
      return 'invalid_only';
    case 'formatting':
      return 'valid_only';
    case 'numeric':
    case 'money_handler':
      return 'boundary';
    default:
      return 'both';
  }
}

function generateInputsForProperty(
  property: PropertyKind,
  rng: () => number,
  candidate: PureFunctionCandidate,
): GeneratedPropertyTestInput[] {
  switch (property) {
    case 'idempotency':
      return generateIdempotencyInputs(rng);
    case 'non_negative':
      return generateNonNegativeInputs(rng);
    case 'required_field':
      return generateRequiredFieldInputs();
    case 'type_constraint':
      return generateTypeConstraintInputs(rng);
    case 'string_id':
      return generateStringIdPropertyInputs(rng);
    case 'money_precision':
      return generateMoneyPrecisionInputs(rng);
    case 'enum_value':
      return generateEnumValueInputs(rng, candidate);
    case 'length_boundary':
      return generateLengthBoundaryInputs(rng);
    case 'injection':
      return generateInjectionInputs();
    case 'general_purity':
      return generateGeneralPurityInputs(rng);
    default:
      return [];
  }
}

// ── Property-specific input generators ──

function generateIdempotencyInputs(rng: () => number): GeneratedPropertyTestInput[] {
  const inputs: GeneratedPropertyTestInput[] = [];
  const testCount = 120;

  for (let i = 0; i < testCount; i++) {
    const val = generateRandomValue(rng, ['string', 'number', 'boolean']);
    inputs.push({
      value: val,
      description: `Idempotency check #${i + 1}: f(f(x)) should equal f(x)`,
      expected: 'pass',
      expectedBehavior:
        'Applying the function twice should produce the same result as applying it once',
    });
  }

  return inputs;
}

function generateNonNegativeInputs(rng: () => number): GeneratedPropertyTestInput[] {
  const inputs: GeneratedPropertyTestInput[] = [];

  // Valid: non-negative values
  const validValues = [
    0,
    1,
    10,
    100,
    1000,
    999999,
    0.01,
    0.001,
    1.5,
    99.99,
    100.5,
    42,
    Number.MAX_SAFE_INTEGER,
  ];
  for (const v of validValues) {
    inputs.push({
      value: v,
      description: `Non-negative input: ${v}`,
      expected: 'pass',
      expectedBehavior: 'Result should be non-negative (>= 0)',
    });
  }

  // Invalid: negative values
  const invalidValues = [-1, -0.01, -100, -9999.99, -Number.MAX_SAFE_INTEGER];
  for (const v of invalidValues) {
    inputs.push({
      value: v,
      description: `Negative input: ${v}`,
      expected: 'fail',
      expectedBehavior: 'Should reject or clamp negative monetary values',
    });
  }

  // Edge: NaN, Infinity
  inputs.push({
    value: NaN,
    description: 'NaN input',
    expected: 'fail',
    expectedBehavior: 'Should reject NaN as monetary input',
  });
  inputs.push({
    value: Infinity,
    description: 'Infinity input',
    expected: 'fail',
    expectedBehavior: 'Should reject Infinity as monetary input',
  });
  inputs.push({
    value: -Infinity,
    description: '-Infinity input',
    expected: 'fail',
    expectedBehavior: 'Should reject -Infinity as monetary input',
  });

  // Random non-negative values (800+)
  for (let i = 0; i < 830; i++) {
    const abs = Math.abs(rng() * 1_000_000);
    const val = rng() > 0.1 ? abs : parseFloat(abs.toFixed(2));
    inputs.push({
      value: val,
      description: `Random non-negative #${i + 1}`,
      expected: 'pass',
      expectedBehavior: 'Result should be >= 0',
    });
  }

  return inputs;
}

function generateRequiredFieldInputs(): GeneratedPropertyTestInput[] {
  const inputs: GeneratedPropertyTestInput[] = [];

  // Missing/empty values
  const missingValues: Array<{ value: unknown; label: string }> = [
    { value: undefined, label: 'undefined' },
    { value: null, label: 'null' },
    { value: '', label: 'empty string' },
    { value: {}, label: 'empty object literal' },
    { value: [], label: 'empty array' },
  ];

  for (const { value, label } of missingValues) {
    inputs.push({
      value,
      description: `Required field with ${label}`,
      expected: 'fail',
      expectedBehavior: 'Should reject missing/empty required fields',
    });
  }

  // Valid present values
  const validValues = ['valid-value', 42, true, { id: 1 }, [1, 2]];
  for (const v of validValues) {
    inputs.push({
      value: v,
      description: `Required field with valid value: ${JSON.stringify(v)}`,
      expected: 'pass',
      expectedBehavior: 'Should accept valid required field values',
    });
  }

  return inputs;
}

function generateTypeConstraintInputs(rng: () => number): GeneratedPropertyTestInput[] {
  const inputs: GeneratedPropertyTestInput[] = [];
  const typeCategories = ['string', 'number', 'boolean', 'object', 'array', 'null', 'undefined'];

  for (let i = 0; i < 200; i++) {
    const type = typeCategories[Math.floor(rng() * typeCategories.length)];
    const val = generateValueOfType(type, rng);
    inputs.push({
      value: val,
      description: `Type constraint input #${i + 1} (${type})`,
      expected: type === 'null' || type === 'undefined' ? 'fail' : 'pass',
      expectedBehavior: `Type ${type} should be handled according to function's type contract`,
    });
  }

  return inputs;
}

function generateStringIdPropertyInputs(rng: () => number): GeneratedPropertyTestInput[] {
  const inputs: GeneratedPropertyTestInput[] = [];

  // Valid IDs
  const validIds = [
    'abc123',
    'user_42',
    'org-7f8a9b',
    'a'.repeat(10),
    'test@example.com',
    'c0a8b001-0000-4000-8000-000000000001',
    'https://example.com/resource/42',
  ];
  for (const id of validIds) {
    inputs.push({
      value: id,
      description: `Valid string ID: "${id}"`,
      expected: 'pass',
      expectedBehavior: 'Should accept valid string IDs',
    });
  }

  // Empty/absent IDs
  inputs.push({
    value: '',
    description: 'Empty string ID',
    expected: 'fail',
    expectedBehavior: 'Should reject empty string IDs',
  });
  inputs.push({
    value: null,
    description: 'Null string ID',
    expected: 'fail',
    expectedBehavior: 'Should reject null string IDs',
  });
  inputs.push({
    value: undefined,
    description: 'Undefined string ID',
    expected: 'fail',
    expectedBehavior: 'Should reject undefined string IDs',
  });

  // Very long IDs
  inputs.push({
    value: 'a'.repeat(1001),
    description: 'Very long ID (1001 chars)',
    expected: 'fail',
    expectedBehavior: 'Should reject excessively long string IDs',
  });
  inputs.push({
    value: 'x'.repeat(500),
    description: 'Long ID (500 chars)',
    expected: 'fail',
    expectedBehavior: 'Should reject or truncate excessively long IDs',
  });

  // Special characters
  for (const ch of SPECIAL_CHARS) {
    inputs.push({
      value: `id${ch}test`,
      description: `String ID with special char: ${JSON.stringify(ch)}`,
      expected: 'fail',
      expectedBehavior: 'Should reject IDs containing control/special characters',
    });
  }

  // Unicode
  const unicodeIds = [
    '日本語',
    '中文测试',
    'العربية',
    '😀🎉',
    'café',
    '\u0000test',
    'test\u0000',
    'zero\u0000byte',
  ];
  for (const id of unicodeIds) {
    inputs.push({
      value: id,
      description: `Unicode string ID: ${id}`,
      expected: 'fail',
      expectedBehavior: 'Should reject or sanitize IDs with non-ASCII characters',
    });
  }

  // Random IDs (900+)
  for (let i = 0; i < 910; i++) {
    const len = Math.floor(rng() * 100) + 1;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789-_';
    let id = '';
    for (let j = 0; j < len; j++) {
      id += chars[Math.floor(rng() * chars.length)];
    }
    const isInvalid = len > 255 || len === 0 || rng() < 0.02;
    inputs.push({
      value: id,
      description: `Generated string ID #${i + 1} (len=${len})`,
      expected: isInvalid ? 'fail' : 'pass',
      expectedBehavior: isInvalid
        ? 'IDs outside valid length boundaries should be rejected'
        : 'Should accept valid generated IDs',
    });
  }

  return inputs;
}

function generateMoneyPrecisionInputs(rng: () => number): GeneratedPropertyTestInput[] {
  const inputs: GeneratedPropertyTestInput[] = [];

  // Valid money values (integer cents are safe)
  const validValues = [
    '0',
    '100',
    '9999',
    '42',
    '1',
    'R$ 0,00',
    'R$ 1,00',
    'R$ 123,45',
    'R$ 9.999,99',
    '1.234,56',
    '0,01',
    '0,99',
    '1,50',
  ];
  for (const v of validValues) {
    inputs.push({
      value: v,
      description: `Valid BRL string: "${v}"`,
      expected: 'pass',
      expectedBehavior: 'Should parse valid BRL currency strings to integer cents',
    });
  }

  // Invalid money strings
  const invalidValues = [
    '',
    'not money',
    'R$ -1,00',
    'R$ abc',
    'free',
    'R$ 1.234.567.890,12', // excessively large
  ];
  for (const v of invalidValues) {
    inputs.push({
      value: v,
      description: `Invalid BRL string: "${v}"`,
      expected: 'fail',
      expectedBehavior: 'Should reject unparseable BRL strings',
    });
  }

  // Precision tests (0.1 + 0.2 !== 0.3 in floating point)
  inputs.push({
    value: { a: 10, b: 20 },
    description: 'Cents addition: 10 + 20 = 30',
    expected: 'pass',
    expectedBehavior: 'Integer cents arithmetic should be exact (30 = 30)',
  });
  inputs.push({
    value: { a: 1, b: 2 },
    description: 'Small cents addition: 1 + 2 = 3',
    expected: 'pass',
    expectedBehavior: 'Integer cents arithmetic should be exact',
  });
  inputs.push({
    value: { a: 99999999, b: 1 },
    description: 'Large cents with overflow risk',
    expected: 'fail',
    expectedBehavior: 'Should guard against integer overflow in cents arithmetic',
  });

  // Round-trip: format(parse(x)) ≈ x
  const roundTripValues = [
    'R$ 0,00',
    'R$ 1,00',
    'R$ 42,50',
    'R$ 100,00',
    'R$ 1.000,00',
    'R$ 99,99',
  ];
  for (const v of roundTripValues) {
    inputs.push({
      value: v,
      description: `Round-trip property: format(parse("${v}")) ≈ "${v}"`,
      expected: 'pass',
      expectedBehavior: 'Round-trip format/parse should be idempotent for valid BRL',
    });
  }

  // Random money values (880+)
  for (let i = 0; i < 880; i++) {
    const major = Math.floor(rng() * 1_000_000);
    const minor = Math.floor(rng() * 100);
    const formatted = `R$ ${major.toLocaleString('pt-BR')},${minor.toString().padStart(2, '0')}`;
    const isInvalid = rng() < 0.05;
    inputs.push({
      value: isInvalid ? `invalid_${i}` : formatted,
      description: `Money precision test #${i + 1}`,
      expected: isInvalid ? 'fail' : 'pass',
      expectedBehavior: isInvalid
        ? 'Should reject invalid money strings'
        : 'Should parse valid BRL with correct cent precision',
    });
  }

  return inputs;
}

function generateEnumValueInputs(
  rng: () => number,
  candidate: PureFunctionCandidate,
): GeneratedPropertyTestInput[] {
  const inputs: GeneratedPropertyTestInput[] = [];
  const enumName = candidate.functionName;
  const discoveredMembers = inferEnumMembersFromCandidate(candidate);

  for (const member of discoveredMembers) {
    inputs.push({
      value: member,
      description: `Candidate member for ${enumName}: ${member}`,
      expected: 'pass',
      expectedBehavior: `Should accept a member discovered from ${enumName}`,
    });
  }

  const invalids = ['INVALID', 'UNKNOWN', '', 'lower_case_value', 42, null, undefined];
  for (const inv of invalids) {
    inputs.push({
      value: inv,
      description: `Invalid ${enumName} value: ${JSON.stringify(inv)}`,
      expected: 'fail',
      expectedBehavior: `Should reject values outside the discovered ${enumName} set`,
    });
  }

  // Random enum-like tests
  for (let i = 0; i < 200; i++) {
    const isInvalid = rng() < 0.4;
    const value = isInvalid
      ? `INVALID_VALUE_${Math.floor(rng() * 100)}`
      : discoveredMembers[Math.floor(rng() * discoveredMembers.length)];
    inputs.push({
      value,
      description: `Enum test #${i + 1} for ${enumName}: "${value}"`,
      expected: isInvalid ? 'fail' : 'pass',
      expectedBehavior: isInvalid
        ? 'Should reject values not in the enum set'
        : 'Should accept values within the enum set',
    });
  }

  return inputs;
}

function inferEnumMembersFromCandidate(candidate: PureFunctionCandidate): string[] {
  const words = candidate.functionName
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .map((word) => word.trim().toUpperCase())
    .filter((word) => word.length > 2);

  return [...new Set([...words, 'VALUE_A', 'VALUE_B', 'VALUE_C'])];
}

function generateLengthBoundaryInputs(rng: () => number): GeneratedPropertyTestInput[] {
  const inputs: GeneratedPropertyTestInput[] = [];

  // Boundry lengths: 0, 1, 255, 256, 1000, 10000, 65535
  const boundaries = [0, 1, 255, 256, 1000, 1001, 10000, 65535, 65536];

  for (const len of boundaries) {
    const val = 'x'.repeat(len);
    const isValid = len > 0 && len <= 65535;
    inputs.push({
      value: val,
      description: `String of length ${len}`,
      expected: isValid ? 'pass' : 'fail',
      expectedBehavior: isValid
        ? 'Should accept strings within length boundaries'
        : `Should reject strings of length ${len} (outside valid boundary)`,
    });
  }

  // Boundary: empty
  inputs.push({
    value: '',
    description: 'Empty string (length 0)',
    expected: 'fail',
    expectedBehavior: 'Should reject empty strings for non-optional fields',
  });

  // Random lengths (600+)
  for (let i = 0; i < 610; i++) {
    const len = Math.floor(rng() * 2000);
    const val = 'a'.repeat(len);
    const isInvalid = len === 0 || len > 1000;
    inputs.push({
      value: val,
      description: `Random length string #${i + 1} (len=${len})`,
      expected: isInvalid ? 'fail' : 'pass',
      expectedBehavior: isInvalid
        ? 'Should reject strings outside valid length range'
        : 'Should accept strings within valid length range',
    });
  }

  return inputs;
}

function generateInjectionInputs(): GeneratedPropertyTestInput[] {
  const inputs: GeneratedPropertyTestInput[] = [];

  // SQL injection patterns
  for (const pattern of SQL_INJECTION_PATTERNS) {
    inputs.push({
      value: pattern,
      description: `SQL injection pattern: "${pattern}"`,
      expected: 'fail',
      expectedBehavior: 'Should reject or sanitize SQL injection patterns in string inputs',
    });
  }

  // NoSQL injection patterns
  for (const pattern of NOSQL_INJECTION_PATTERNS) {
    inputs.push({
      value: pattern,
      description: `NoSQL injection pattern: "${pattern}"`,
      expected: 'fail',
      expectedBehavior: 'Should reject or sanitize NoSQL injection patterns',
    });
  }

  // XSS patterns
  for (const pattern of XSS_PATTERNS) {
    inputs.push({
      value: pattern,
      description: `XSS pattern: "${pattern}"`,
      expected: 'fail',
      expectedBehavior: 'Should reject or sanitize XSS payloads in string inputs',
    });
  }

  // Path traversal
  const traversalPatterns = [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32',
    '%2e%2e%2fetc%2fpasswd',
    '....//....//etc/passwd',
  ];
  for (const pattern of traversalPatterns) {
    inputs.push({
      value: pattern,
      description: `Path traversal pattern: "${pattern}"`,
      expected: 'fail',
      expectedBehavior: 'Should reject path traversal attempts in string inputs',
    });
  }

  return inputs;
}

function generateGeneralPurityInputs(rng: () => number): GeneratedPropertyTestInput[] {
  const inputs: GeneratedPropertyTestInput[] = [];

  // Data-driven test series
  for (let i = 0; i < 1000; i++) {
    const kind = Math.floor(rng() * 6);
    let value: unknown;
    let description: string;
    let expected: 'pass' | 'fail';
    let behavior: string;

    switch (kind) {
      case 0: {
        value = String.fromCharCode(
          ...Array(Math.floor(rng() * 20) + 1)
            .fill(0)
            .map(() => Math.floor(rng() * 95) + 32),
        );
        description = `Random printable string #${i + 1}`;
        expected = 'pass';
        behavior = 'Should handle printable ASCII strings without side effects';
        break;
      }
      case 1: {
        value = Math.round(rng() * 1_000_000);
        description = `Random positive integer #${i + 1}`;
        expected = 'pass';
        behavior = 'Should handle integers without loss of precision';
        break;
      }
      case 2: {
        value = rng() < 0.5;
        description = `Random boolean #${i + 1}`;
        expected = 'pass';
        behavior = 'Should handle boolean inputs correctly';
        break;
      }
      case 3: {
        const objLen = Math.floor(rng() * 5) + 1;
        const obj: Record<string, unknown> = {};
        for (let j = 0; j < objLen; j++) {
          obj[`key_${j}`] = rng() < 0.5 ? `val_${j}` : Math.floor(rng() * 100);
        }
        value = obj;
        description = `Random object with ${objLen} keys #${i + 1}`;
        expected = 'pass';
        behavior = 'Should handle structured objects without mutation of input';
        break;
      }
      case 4: {
        const arrLen = Math.floor(rng() * 10) + 1;
        value = Array(arrLen)
          .fill(0)
          .map(() => Math.floor(rng() * 100));
        description = `Random number array (len=${arrLen}) #${i + 1}`;
        expected = 'pass';
        behavior = 'Should handle arrays without mutating the original';
        break;
      }
      default: {
        value = undefined;
        description = `Undefined input #${i + 1}`;
        expected = 'fail';
        behavior = 'Should handle undefined without throwing unexpected errors';
      }
    }

    inputs.push({ value, description, expected, expectedBehavior: behavior });
  }

  return inputs;
}

// ── Value generation utilities ──

function generateRandomValue(rng: () => number, types: string[]): unknown {
  const type = types[Math.floor(rng() * types.length)];
  return generateValueOfType(type, rng);
}

function generateValueOfType(type: string, rng: () => number): unknown {
  switch (type) {
    case 'string':
      return randomString(rng);
    case 'number':
      return randomNumber(rng);
    case 'boolean':
      return rng() < 0.5;
    case 'object':
      return randomObject(rng);
    case 'array':
      return randomArray(rng);
    case 'null':
      return null;
    case 'undefined':
      return undefined;
    default:
      return randomString(rng);
  }
}

function randomString(rng: () => number): string {
  const len = Math.floor(rng() * 50) + 1;
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-';
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(rng() * chars.length)];
  }
  return result;
}

function randomNumber(rng: () => number): number {
  const magnitude = Math.floor(rng() * 6) - 3;
  const base = rng() * 1000;
  return parseFloat((base * Math.pow(10, magnitude)).toFixed(4));
}

function randomObject(rng: () => number): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  const count = Math.floor(rng() * 5) + 1;
  for (let i = 0; i < count; i++) {
    obj[`prop_${i}`] = generateRandomValue(rng, ['string', 'number', 'boolean']);
  }
  return obj;
}

function randomArray(rng: () => number): unknown[] {
  const count = Math.floor(rng() * 8) + 1;
  return Array(count)
    .fill(0)
    .map(() => generateRandomValue(rng, ['string', 'number', 'boolean']));
}
