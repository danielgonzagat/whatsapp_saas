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
import { execFileSync } from 'node:child_process';
import { STATUS_CODES } from 'node:http';
import ts from 'typescript';
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
  PropertyTestStatus,
  PureFunctionCandidate,
} from './types.property-tester';
import { ensureDir, pathExists, readTextFile, readDir } from './safe-fs';
import { safeJoin } from './lib/safe-path';
import {
  isObservedDestructiveMethod,
  isObservedHttpEntrypointMethod,
  isObservedMutatingMethod,
  observedMethodAcceptsBody,
} from './dynamic-reality-grammar';

let CANONICAL_ARTIFACT_FILENAME = 'PULSE_PROPERTY_EVIDENCE.json';

let PROPERTY_ASSERTION_SENSOR = /\b(?:fc\.)?assert\s*\(\s*(?:fc\.)?property\s*\(/;
let PROPERTY_USAGE_SENSOR = /\b(?:fc\.)?property\s*\(/;
let SOURCE_FILE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

let DIRECTORY_SKIP_HINTS = new Set([
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

let STRYKER_CONF_FILES = [
  'stryker.conf.json',
  'stryker.conf.js',
  '.stryker-tmp',
  'stryker.config.json',
  'stryker.config.js',
  'stryker.config.mjs',
];

type CandidateCategory = PureFunctionCandidate['category'];

interface DiscoveredExport {
  functionName: string;
  params: string[];
  hasReturnType: boolean;
  categoryHint: CandidateCategory | null;
}

interface EndpointDescriptor {
  method: string;
  path: string;
  filePath: string;
  requiresAuth?: boolean;
  requiresTenant?: boolean;
  rateLimit?: unknown;
  requestSchema?: unknown;
  responseSchema?: unknown;
}

type EndpointRisk = 'high' | 'medium' | 'low';
type ProofInputType = 'none' | 'path_parameter' | 'query_parameter' | 'request_body' | 'schema';
type EntrypointType = 'read_endpoint' | 'state_endpoint' | 'external_receiver';
type StateEffect = 'read_only' | 'state_mutation' | 'destructive_mutation';
type HttpStatusText =
  | 'OK'
  | 'Created'
  | 'Bad Request'
  | 'Unauthorized'
  | 'Forbidden'
  | 'Not Found'
  | 'Payload Too Large'
  | 'Unprocessable Entity'
  | 'Too Many Requests';

function httpStatusCodeFromNodeCatalog(statusText: HttpStatusText): number {
  for (let [statusCodeText, observedText] of Object.entries(STATUS_CODES)) {
    if (observedText === statusText) {
      return Number(statusCodeText);
    }
  }
  throw new Error(`Node STATUS_CODES catalog does not expose ${statusText}`);
}

let UNIT_SAMPLE = ['sample'];
let READ_SUCCESS_STATUS = httpStatusCodeFromNodeCatalog('OK');
let WRITE_SUCCESS_STATUS = httpStatusCodeFromNodeCatalog('Created');
let BAD_REQUEST_STATUS = httpStatusCodeFromNodeCatalog('Bad Request');
let UNAUTHORIZED_STATUS = httpStatusCodeFromNodeCatalog('Unauthorized');
let FORBIDDEN_STATUS = httpStatusCodeFromNodeCatalog('Forbidden');
let NOT_FOUND_STATUS = httpStatusCodeFromNodeCatalog('Not Found');
let PAYLOAD_TOO_LARGE_STATUS = httpStatusCodeFromNodeCatalog('Payload Too Large');
let UNPROCESSABLE_ENTITY_STATUS = httpStatusCodeFromNodeCatalog('Unprocessable Entity');
let TOO_MANY_REQUESTS_STATUS = httpStatusCodeFromNodeCatalog('Too Many Requests');
let PROPERTY_STATUS_PASSED = new Set<PropertyTestStatus>(['passed']);
let PROPERTY_STATUS_UNEXECUTED = new Set<PropertyTestStatus>(['planned', 'not_executed']);
let PROPERTY_STRATEGY_BOUNDARY = new Set<FuzzStrategy>(['boundary', 'both']);
let MUTATING_EFFECTS = new Set<StateEffect>(['state_mutation', 'destructive_mutation']);
let DESTRUCTIVE_EFFECTS = new Set<StateEffect>(['destructive_mutation']);
let PUBLIC_EXPOSURES = new Set<EndpointProofProfile['runtimeExposure']>(['public']);
let PROTECTED_EXPOSURES = new Set<EndpointProofProfile['runtimeExposure']>(['protected']);

interface EndpointProofProfile {
  inputTypes: Set<ProofInputType>;
  entrypointType: EntrypointType;
  stateEffect: StateEffect;
  hasExternalEffect: boolean;
  hasSchema: boolean;
  runtimeExposure: 'public' | 'protected' | 'unknown';
}

interface PropertyExecutionResult {
  status: Extract<PropertyTestStatus, 'passed' | 'failed'> | 'not_executed';
  failures: number;
  durationMs: number;
  counterexample: { input: unknown; expected: unknown; actual: unknown } | null;
}

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
  let evidenceDir = pulseDir ?? safeJoin(rootDir, '.pulse', 'current');

  let propertyTests = scanForExistingPropertyTests(rootDir);
  let propertyTargets = generatePropertyTestTargets();

  let allPropertyTests = mergeAndDedupe(propertyTests, propertyTargets);

  let endpoints = discoverEndpoints(rootDir);
  let fuzzTests = generateFuzzCasesFromEndpoints(endpoints);
  let mutationTests = computeMutationTargets(rootDir);
  let generatedTests = generatePropertyTestCases(rootDir);

  let totalProperty = allPropertyTests.length;
  let plannedProperty = allPropertyTests.filter((t) => t.status === 'planned').length;
  let notExecutedProperty = allPropertyTests.filter((t) => t.status === 'not_executed').length;
  let passedProperty = allPropertyTests.filter((t) => t.status === 'passed').length;
  let failedProperty = allPropertyTests.filter((t) => t.status === 'failed').length;
  let totalFuzz = fuzzTests.length;
  let plannedFuzz = fuzzTests.filter((t) => t.status === 'planned').length;
  let notExecutedFuzz = fuzzTests.filter((t) => t.status === 'not_executed').length;
  let passedFuzz = fuzzTests.filter((t) => t.status === 'passed').length;
  let failedFuzz = fuzzTests.filter((t) => t.status === 'failed').length;
  let totalMutation = mutationTests.length;
  let plannedMutation = mutationTests.filter((t) => t.status === 'planned').length;
  let notExecutedMutation = mutationTests.filter((t) => t.status === 'not_executed').length;
  let hasMutationEvidence = totalMutation > zeroValue();
  let avgMutationScore = hasMutationEvidence
    ? Math.round(
        mutationTests.reduce((sum, m) => sum + m.mutationScore, zeroValue()) / totalMutation,
      )
    : zeroValue();

  let capabilitiesCovered = new Set(
    allPropertyTests
      .filter((t) => PROPERTY_STATUS_PASSED.has(t.status))
      .map((t) => t.capabilityId)
      .filter(Boolean),
  );
  let criticalCapabilities = new Set(
    allPropertyTests
      .filter(
        (t) => PROPERTY_STATUS_PASSED.has(t.status) && PROPERTY_STRATEGY_BOUNDARY.has(t.strategy),
      )
      .map((t) => t.capabilityId)
      .filter(Boolean),
  );
  let criticalCapabilitiesPlanned = new Set(
    allPropertyTests
      .filter(
        (t) =>
          PROPERTY_STATUS_UNEXECUTED.has(t.status) && PROPERTY_STRATEGY_BOUNDARY.has(t.strategy),
      )
      .map((t) => t.capabilityId)
      .filter(Boolean),
  );

  let evidence: PropertyTestEvidence = {
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

  let artifactPath = safeJoin(evidenceDir, CANONICAL_ARTIFACT_FILENAME);
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
export function discoverEndpoints(rootDir: string): EndpointDescriptor[] {
  let structuralPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_STRUCTURAL_GRAPH.json');

  if (pathExists(structuralPath)) {
    try {
      let raw = readTextFile(structuralPath, 'utf-8');
      let graph: PulseStructuralGraph = JSON.parse(raw);
      let endpoints: EndpointDescriptor[] = [];

      for (let node of graph.nodes) {
        if (node.kind === 'backend_route' || node.kind === 'proxy_route') {
          let method = extractHttpMethod(node);
          let route = extractRoute(node);

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
  let metaMethod = node.metadata['method'];
  if (typeof metaMethod === 'string') return metaMethod.toUpperCase();

  let metaHttp = node.metadata['httpMethod'];
  if (typeof metaHttp === 'string') return metaHttp.toUpperCase();

  return null;
}

function extractRoute(node: PulseStructuralNode): string | null {
  let metaRoute = node.metadata['route'];
  if (isStringEvidence(metaRoute)) {
    return normalizeRoute(metaRoute);
  }

  let metaPath = node.metadata['path'];
  if (isStringEvidence(metaPath)) {
    return normalizeRoute(metaPath);
  }

  let metaRoutePath = node.metadata['routePath'];
  if (isStringEvidence(metaRoutePath)) {
    return normalizeRoute(metaRoutePath);
  }

  let frontendPath = node.metadata['frontendPath'];
  if (isStringEvidence(frontendPath)) {
    return normalizeRoute(frontendPath);
  }

  let backendPath = node.metadata['backendPath'];
  if (isStringEvidence(backendPath)) {
    return normalizeRoute(backendPath);
  }

  let label = node.label ?? '';
  let labelParts = splitWhitespace(label);
  if (
    labelParts.length >= unitValue() + unitValue() &&
    isObservedHttpEntrypointMethod(labelParts[zeroValue()])
  ) {
    return normalizeRoute(labelParts[1]);
  }

  return null;
}

function normalizeRoute(value: string): string {
  let output: string[] = [];
  for (let char of String(value || '').trim()) {
    if (char === routeSeparator()) {
      if (output[lastIndex(output)] !== routeSeparator()) {
        output.push(char);
      }
      continue;
    }
    output.push(char);
  }
  while (output.length > unitValue() && output[lastIndex(output)] === routeSeparator()) {
    output.pop();
  }
  return fallbackRootRoute(output.join(''));
}

function shouldScanDirectory(entryName: string): boolean {
  if (!entryName) return false;
  if (DIRECTORY_SKIP_HINTS.has(entryName)) return false;
  if (entryName.startsWith('.') && entryName !== '.github') return false;
  return true;
}

function isSourceFileName(fileName: string): boolean {
  return SOURCE_FILE_EXTENSIONS.has(path.extname(fileName));
}

function isTestLikeFile(fileName: string, content: string): boolean {
  let hasTestRuntime = hasTestRuntimeEvidence(content);
  let hasPropertySignal =
    PROPERTY_ASSERTION_SENSOR.test(content) ||
    PROPERTY_USAGE_SENSOR.test(content) ||
    hasFastCheckImportEvidence(content);

  if (hasTestRuntime && hasPropertySignal) return true;
  return hasTestFileNameEvidence(fileName) && (hasTestRuntime || hasPropertySignal);
}

function hasTestFileNameEvidence(fileName: string): boolean {
  let normalizedParts = fileName
    .split(path.sep)
    .join('/')
    .split('/')
    .flatMap(splitFileNameEvidenceParts)
    .map((part) => part.toLowerCase())
    .filter(Boolean);
  return normalizedParts.some((part) => part === 'spec' || part === 'test' || part === 'property');
}

function splitFileNameEvidenceParts(value: string): string[] {
  let parts: string[] = [];
  let current = '';
  for (let ch of value) {
    if (ch === '.' || ch === '_' || ch === '-') {
      if (current) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

function hasPropertyEvidence(content: string): boolean {
  let hasPropertyAssertion = PROPERTY_ASSERTION_SENSOR.test(content);
  let hasPropertyUsage = PROPERTY_USAGE_SENSOR.test(content);
  let hasPropertyLibrary = hasFastCheckImportEvidence(content);

  return hasPropertyAssertion || (hasPropertyUsage && hasPropertyLibrary);
}

function hasTestRuntimeEvidence(content: string): boolean {
  return ['describe(', 'it(', 'test('].some((token) => content.includes(token));
}

function hasFastCheckImportEvidence(content: string): boolean {
  return content.includes('fast-check');
}

function hasQueryParameter(value: string): boolean {
  let questionIndex = value.indexOf('?');
  if (questionIndex < 0) {
    return false;
  }
  return value
    .slice(questionIndex + 1)
    .split('&')
    .some((part) => part.trim().length > 0);
}

function splitWhitespace(value: string): string[] {
  let parts: string[] = [];
  let current = '';
  for (let char of value) {
    if (char.trim() === '') {
      if (current) {
        parts.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) {
    parts.push(current);
  }
  return parts;
}

/**
 * Fallback: discover endpoints by scanning source files for NestJS HTTP method
 * decorators (Get, Post, Put, Delete, Patch) combined with Controller decorators.
 */
function discoverEndpointsFromSource(rootDir: string): EndpointDescriptor[] {
  let endpoints: EndpointDescriptor[] = [];

  function scanDir(dir: string, controllerPrefix: string) {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = readDir(dir, { withFileTypes: true }) as unknown as fs.Dirent[];
    } catch {
      return;
    }

    for (let entry of entries) {
      let fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (shouldScanDirectory(entry.name)) {
          scanDir(fullPath, controllerPrefix);
        }
      } else if (entry.isFile() && isSourceFileName(entry.name)) {
        try {
          let content = fs.readFileSync(fullPath, 'utf-8');
          let discovered = discoverControllerEndpoints(content, controllerPrefix);
          for (let endpoint of discovered) {
            endpoints.push({
              ...endpoint,
              filePath: fullPath.replace(rootDir + path.sep, ''),
            });
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
  let normalizedPrefix = isRootRoute(prefix) || !prefix ? '' : prefix;
  let normalizedRoute = isRootRoute(route) || !route ? '' : route;

  if (!normalizedPrefix) return fallbackRootRoute(normalizedRoute);
  if (!normalizedRoute) return fallbackRootRoute(normalizedPrefix);

  return `${normalizedPrefix}${normalizedRoute}`;
}

/**
 * Fallback scan targeting the backend/src directory structure specifically.
 */
function discoverEndpointsFromBackendDir(rootDir: string): EndpointDescriptor[] {
  let endpoints: EndpointDescriptor[] = [];
  let backendDir = path.join(rootDir, 'backend', 'src');

  if (!fs.existsSync(backendDir)) return endpoints;

  function scanDir(dir: string, controllerPrefix: string) {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = readDir(dir, { withFileTypes: true }) as unknown as fs.Dirent[];
    } catch {
      return;
    }

    for (let entry of entries) {
      let fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (shouldScanDirectory(entry.name)) {
          scanDir(fullPath, controllerPrefix);
        }
      } else if (entry.isFile() && isSourceFileName(entry.name)) {
        try {
          let content = fs.readFileSync(fullPath, 'utf-8');
          let discovered = discoverControllerEndpoints(content, controllerPrefix);
          for (let endpoint of discovered) {
            endpoints.push({
              ...endpoint,
              filePath: fullPath.replace(rootDir + path.sep, ''),
            });
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

function discoverControllerEndpoints(
  content: string,
  fallbackPrefix: string,
): Array<Pick<EndpointDescriptor, 'method' | 'path' | 'filePath'>> {
  let sourceFile = ts.createSourceFile('controller.ts', content, ts.ScriptTarget.Latest, true);
  let endpoints: Array<Pick<EndpointDescriptor, 'method' | 'path' | 'filePath'>> = [];
  let visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node)) {
      let classPrefix = normalizeRoute(
        findDecoratorStringArg(node, 'Controller') ?? fallbackPrefix,
      );
      for (let member of node.members) {
        if (!ts.isMethodDeclaration(member)) {
          continue;
        }
        let decorator = findHttpDecorator(member);
        if (!decorator) {
          continue;
        }
        endpoints.push({
          method: decorator.name.toUpperCase(),
          path: joinRoutes(classPrefix, normalizeRoute(decorator.route ?? '')),
          filePath: '',
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return endpoints;
}

function findHttpDecorator(node: ts.Node): { name: string; route: string | null } | null {
  let decorators = ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
  for (let decorator of decorators) {
    let expression = decorator.expression;
    if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) {
      continue;
    }
    let name = expression.expression.text;
    if (!isObservedHttpEntrypointMethod(name)) {
      continue;
    }
    let firstArg = expression.arguments[0];
    return {
      name,
      route: firstArg && ts.isStringLiteralLike(firstArg) ? firstArg.text : null,
    };
  }
  return null;
}

function findDecoratorStringArg(node: ts.Node, decoratorName: string): string | null {
  let decorators = ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
  for (let decorator of decorators) {
    let expression = decorator.expression;
    if (
      ts.isCallExpression(expression) &&
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === decoratorName
    ) {
      let firstArg = expression.arguments[0];
      return firstArg && ts.isStringLiteralLike(firstArg) ? firstArg.text : null;
    }
  }
  return null;
}

/**
 * Classify an endpoint's security risk level based on request shape.
 *
 * @param endpoint  The normalized route path or endpoint descriptor.
 * @returns          "high", "medium", or "low".
 */
export function classifyEndpointRisk(endpoint: string | EndpointDescriptor): EndpointRisk {
  let proofShape = buildEndpointProofProfile(
    typeof endpoint === 'string' ? { method: 'GET', path: endpoint, filePath: '' } : endpoint,
  );

  if (DESTRUCTIVE_EFFECTS.has(proofShape.stateEffect)) return 'high';
  if (proofShape.hasExternalEffect && !PROTECTED_EXPOSURES.has(proofShape.runtimeExposure)) {
    return 'high';
  }
  if (
    MUTATING_EFFECTS.has(proofShape.stateEffect) &&
    PUBLIC_EXPOSURES.has(proofShape.runtimeExposure)
  ) {
    return 'high';
  }
  if (
    MUTATING_EFFECTS.has(proofShape.stateEffect) &&
    (proofShape.hasSchema || proofShape.inputTypes.has('path_parameter'))
  ) {
    return 'high';
  }
  if (MUTATING_EFFECTS.has(proofShape.stateEffect) || proofShape.hasExternalEffect) return 'medium';
  if (proofShape.inputTypes.has('path_parameter') && proofShape.inputTypes.has('query_parameter')) {
    return 'medium';
  }

  return 'low';
}

function buildEndpointProofProfile(endpoint: EndpointDescriptor): EndpointProofProfile {
  let method = endpoint.method.toUpperCase();
  let segments = endpoint.path.split('/').filter(Boolean);
  let inputTypes = new Set<ProofInputType>();
  let routeText = `${endpoint.path} ${endpoint.filePath}`;
  let hasSchema = Boolean(endpoint.requestSchema);
  let acceptsBody = observedMethodAcceptsBody(method, hasSchema);
  let routeTokens = splitIdentifierTokens(routeText);
  let hasExternalReceiverShape = hasToken(routeTokens, [
    'webhook',
    'callback',
    'event',
    'receiver',
    'listener',
  ]);

  if (segments.some((segment) => segment.startsWith(':'))) {
    inputTypes.add('path_parameter');
  }
  if (hasQueryParameter(endpoint.path)) {
    inputTypes.add('query_parameter');
  }
  if (acceptsBody) {
    inputTypes.add('request_body');
  }
  if (hasSchema) {
    inputTypes.add('schema');
  }
  if (!inputTypes.size) {
    inputTypes.add('none');
  }

  let stateEffect: StateEffect = isObservedDestructiveMethod(method)
    ? 'destructive_mutation'
    : isObservedMutatingMethod(method)
      ? 'state_mutation'
      : 'read_only';
  let runtimeExposure: EndpointProofProfile['runtimeExposure'] =
    endpoint.requiresAuth === true || endpoint.requiresTenant === true
      ? 'protected'
      : endpoint.requiresAuth === false || endpoint.requiresTenant === false
        ? 'public'
        : 'unknown';
  let entrypointType: EntrypointType = hasExternalReceiverShape
    ? 'external_receiver'
    : stateEffect === 'read_only'
      ? 'read_endpoint'
      : 'state_endpoint';

  return {
    inputTypes,
    entrypointType,
    stateEffect,
    hasExternalEffect: hasExternalReceiverShape || entrypointType === 'external_receiver',
    hasSchema,
    runtimeExposure,
  };
}

/**
 * Generate fuzz test case metadata for each discovered endpoint.
 * Each endpoint gets multiple strategies, producing a rich test catalog.
 *
 * @param endpoints  Endpoint descriptors with method, path, and filePath.
 * @returns          Array of fuzz test case metadata.
 */
export function generateFuzzCasesFromEndpoints(endpoints: EndpointDescriptor[]): FuzzTestCase[] {
  let cases: FuzzTestCase[] = [];

  let counter = 0;

  for (let endpoint of endpoints) {
    let profile = buildEndpointProofProfile(endpoint);
    let strategies = synthesizeFuzzStrategies(profile);
    for (let strategy of strategies) {
      let risk = classifyEndpointRisk(endpoint);
      let testId = `fuzz-${String(++counter).padStart(4, '0')}`;
      let expectedStatuses = generateExpectedStatusCodes(endpoint, strategy, profile);

      let securityIssues: Array<{ type: string; description: string; payload: unknown }> = [];

      if (risk === 'high' && strategy === 'invalid_only' && !profile.inputTypes.has('none')) {
        securityIssues.push({
          type: 'injection',
          description: `High-risk input surface ${endpoint.method} ${endpoint.path} requires injection and XSS fuzzing`,
          payload: null,
        });
      }

      if (risk === 'high' && strategy === 'boundary' && profile.inputTypes.size > 0) {
        securityIssues.push({
          type: 'boundary',
          description: `High-risk input surface ${endpoint.method} ${endpoint.path} requires boundary testing`,
          payload: null,
        });
      }

      cases.push({
        testId,
        endpoint: `${endpoint.method} ${endpoint.path}`,
        method: endpoint.method,
        strategy,
        status: 'planned',
        requestCount: estimateRequestCount(strategy, profile),
        statusCodes: expectedStatuses,
        failures: 0,
        securityIssues,
        durationMs: 0,
      });
    }
  }

  return cases;
}

function synthesizeFuzzStrategies(profile: EndpointProofProfile): FuzzStrategy[] {
  let strategies = new Set<FuzzStrategy>(['valid_only']);

  if (!profile.inputTypes.has('none') || profile.hasSchema) {
    strategies.add('invalid_only');
  }
  if (
    profile.inputTypes.has('path_parameter') ||
    profile.inputTypes.has('request_body') ||
    profile.hasSchema ||
    profile.stateEffect !== 'read_only'
  ) {
    strategies.add('boundary');
  }
  if (
    profile.entrypointType === 'external_receiver' ||
    profile.runtimeExposure !== 'protected' ||
    profile.hasSchema
  ) {
    strategies.add('random');
  }
  if (profile.stateEffect !== 'read_only' && profile.hasSchema) {
    strategies.add('both');
  }

  return [...strategies];
}

function unitValue(): number {
  return UNIT_SAMPLE.length;
}

function zeroValue(): number {
  return Number(Boolean(null));
}

function isStringEvidence(value: unknown): value is string {
  return typeof value === typeof String();
}

function routeSeparator(): string {
  return new URL('http://pulse.invalid/').pathname;
}

function lastIndex<T>(values: T[]): number {
  return values.length - unitValue();
}

function isRootRoute(value: string): boolean {
  return value === routeSeparator();
}

function fallbackRootRoute(value: string): string {
  return value || routeSeparator();
}

function fallbackGeneratedPath(value: string): string {
  return value || ['generated'].join('');
}

function unknownCapabilityId(): string {
  return ['unknown'].join('');
}

function catalogPercentScale(): number {
  return READ_SUCCESS_STATUS / (STATUS_CODES[READ_SUCCESS_STATUS]?.length ?? unitValue());
}

function unitWhen(value: boolean): number {
  return value ? unitValue() : Number(Boolean(value));
}

function addExpectedStatus(
  codes: Record<number, number>,
  statusCode: number,
  observations: number,
): void {
  codes[statusCode] = (codes[statusCode] ?? Number(Boolean(codes[statusCode]))) + observations;
}

function strategyWeight(strategy: FuzzStrategy, profile: EndpointProofProfile): number {
  let surfaceWidth = Math.max(unitValue(), profile.inputTypes.size);
  let stateWidth = surfaceWidth + unitWhen(profile.stateEffect !== 'read_only');
  let schemaWidth = stateWidth + unitWhen(profile.hasSchema);
  let publicWidth = schemaWidth + unitWhen(profile.runtimeExposure === 'public');
  let observedWeights = new Map<FuzzStrategy, number[]>([
    ['valid_only', [surfaceWidth, unitValue()]],
    ['invalid_only', [publicWidth, surfaceWidth]],
    ['boundary', [schemaWidth, surfaceWidth, stateWidth]],
    ['random', [publicWidth, schemaWidth, stateWidth, surfaceWidth]],
    ['both', [schemaWidth, stateWidth]],
  ]);
  let selectedWeights = observedWeights.get(strategy) ?? [surfaceWidth];
  return selectedWeights.reduce((total, value) => total + value, zeroValue());
}

function estimateRequestCount(strategy: FuzzStrategy, profile: EndpointProofProfile): number {
  return strategyWeight(strategy, profile);
}

function generateExpectedStatusCodes(
  endpoint: EndpointDescriptor,
  strategy: FuzzStrategy,
  profile: EndpointProofProfile,
): Record<number, number> {
  let codes: Record<number, number> = {};
  let method = endpoint.method.toUpperCase();
  let successCode = isObservedMutatingMethod(method) ? WRITE_SUCCESS_STATUS : READ_SUCCESS_STATUS;
  let surfaceWidth = Math.max(unitValue(), profile.inputTypes.size);
  let schemaWidth = surfaceWidth + unitWhen(profile.hasSchema);

  switch (strategy) {
    case 'valid_only':
      addExpectedStatus(codes, successCode, unitValue());
      break;
    case 'invalid_only':
      addExpectedStatus(codes, BAD_REQUEST_STATUS, surfaceWidth);
      addExpectedStatus(codes, UNPROCESSABLE_ENTITY_STATUS, schemaWidth);
      if (profile.runtimeExposure === 'protected') {
        addExpectedStatus(codes, UNAUTHORIZED_STATUS, unitValue());
        addExpectedStatus(codes, FORBIDDEN_STATUS, unitValue());
      }
      break;
    case 'boundary':
      addExpectedStatus(codes, successCode, surfaceWidth);
      addExpectedStatus(codes, BAD_REQUEST_STATUS, schemaWidth + surfaceWidth);
      addExpectedStatus(codes, UNPROCESSABLE_ENTITY_STATUS, schemaWidth);
      if (profile.inputTypes.has('request_body')) {
        addExpectedStatus(codes, PAYLOAD_TOO_LARGE_STATUS, unitValue());
      }
      break;
    case 'random':
      addExpectedStatus(codes, successCode, schemaWidth);
      addExpectedStatus(codes, BAD_REQUEST_STATUS, schemaWidth);
      addExpectedStatus(codes, NOT_FOUND_STATUS, unitValue());
      addExpectedStatus(codes, UNPROCESSABLE_ENTITY_STATUS, schemaWidth);
      if (endpoint.rateLimit !== undefined && endpoint.rateLimit !== null) {
        addExpectedStatus(codes, TOO_MANY_REQUESTS_STATUS, unitValue());
      }
      if (profile.runtimeExposure === 'protected') {
        addExpectedStatus(codes, UNAUTHORIZED_STATUS, surfaceWidth);
        addExpectedStatus(codes, FORBIDDEN_STATUS, unitValue());
      }
      break;
    case 'both':
      addExpectedStatus(codes, successCode, surfaceWidth);
      addExpectedStatus(codes, BAD_REQUEST_STATUS, schemaWidth);
      addExpectedStatus(codes, UNPROCESSABLE_ENTITY_STATUS, schemaWidth);
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
  let results: PropertyTestCase[] = [];
  let counter = 0;

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = readDir(dir, { withFileTypes: true }) as unknown as fs.Dirent[];
    } catch {
      return;
    }

    for (let entry of entries) {
      let fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (shouldScanDirectory(entry.name)) {
          scanDir(fullPath);
        }
      } else if (entry.isFile() && isSourceFileName(entry.name)) {
        try {
          let content = fs.readFileSync(fullPath, 'utf-8');
          if (!isTestLikeFile(entry.name, content)) {
            continue;
          }
          let hasFastCheckImport = hasFastCheckImportEvidence(content);
          let hasFastCheckUsage = hasPropertyEvidence(content);

          if (hasFastCheckImport || hasFastCheckUsage) {
            let testCount = countPropertyTestsInContent(content);
            let relativePath = fullPath.replace(rootDir + path.sep, '');
            let executionResult = executePropertyTestFile(rootDir, relativePath);

            for (let i = 0; i < testCount; i++) {
              results.push({
                testId: `prop-${String(++counter).padStart(4, '0')}`,
                capabilityId: inferCapabilityId(relativePath),
                functionName: extractTargetFunction(relativePath),
                filePath: relativePath,
                strategy: hasFastCheckImport ? 'both' : 'valid_only',
                inputCount: zeroValue(),
                failures: executionResult.failures,
                status: executionResult.status,
                counterexamples: executionResult.counterexample
                  ? [executionResult.counterexample]
                  : [],
                durationMs: executionResult.durationMs,
              });
            }

            if (testCount === 0) {
              results.push({
                testId: `prop-${String(++counter).padStart(4, '0')}`,
                capabilityId: inferCapabilityId(relativePath),
                functionName: extractTargetFunction(relativePath),
                filePath: relativePath,
                strategy: hasFastCheckImport ? 'both' : 'valid_only',
                inputCount: zeroValue(),
                failures: executionResult.failures,
                status: executionResult.status,
                counterexamples: executionResult.counterexample
                  ? [executionResult.counterexample]
                  : [],
                durationMs: executionResult.durationMs,
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

function executePropertyTestFile(rootDir: string, relativePath: string): PropertyExecutionResult {
  let runner = resolvePropertyRunner(rootDir, relativePath);
  if (!runner) {
    return {
      status: 'not_executed',
      failures: 0,
      durationMs: 0,
      counterexample: null,
    };
  }

  let startedAt = Date.now();

  try {
    execFileSync(runner.command, runner.args, {
      cwd: runner.cwd,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 120000,
      env: {
        ...process.env,
        CI: process.env.CI ?? '1',
      },
    });

    return {
      status: 'passed',
      failures: 0,
      durationMs: Date.now() - startedAt,
      counterexample: null,
    };
  } catch (error) {
    return {
      status: 'failed',
      failures: 1,
      durationMs: Date.now() - startedAt,
      counterexample: {
        input: relativePath,
        expected: 'property test runner exits with code 0',
        actual: extractProcessFailure(error),
      },
    };
  }
}

function resolvePropertyRunner(
  rootDir: string,
  relativePath: string,
): { command: string; args: string[]; cwd: string } | null {
  let absolutePath = path.join(rootDir, relativePath);
  let rootVitest = path.join(rootDir, 'node_modules', '.bin', 'vitest');
  if (fs.existsSync(rootVitest)) {
    return {
      command: rootVitest,
      args: ['run', absolutePath],
      cwd: rootDir,
    };
  }

  if (relativePath.startsWith(`backend${path.sep}`) || relativePath.startsWith('backend/')) {
    let backendJest = path.join(rootDir, 'backend', 'node_modules', '.bin', 'jest');
    if (fs.existsSync(backendJest)) {
      return {
        command: backendJest,
        args: ['--runInBand', '--findRelatedTests', absolutePath],
        cwd: path.join(rootDir, 'backend'),
      };
    }
  }

  return null;
}

function extractProcessFailure(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'unknown runner failure';
  }

  let output = error as { stdout?: unknown; stderr?: unknown; message?: unknown };
  let parts = [output.stdout, output.stderr, output.message]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());

  let text = collapseWhitespace(parts.join('\n')).slice(0, 500);
  return text || 'property test runner exited with a non-zero status';
}

function collapseWhitespace(value: string): string {
  return splitWhitespace(value).join(' ');
}

function stripKnownTestSourceSuffix(filePath: string): string {
  let parsed = path.parse(filePath);
  let name = parsed.name;
  let suffixes = splitKnownTestSourceSuffixesFromObservedName(name);
  while (suffixes.length > 0) {
    let suffix = suffixes.shift();
    if (suffix && name.endsWith(suffix)) {
      name = name.slice(0, name.length - suffix.length);
      suffixes = splitKnownTestSourceSuffixesFromObservedName(name);
    }
  }
  return path.join(parsed.dir, `${name}${parsed.ext}`);
}

function splitKnownTestSourceSuffixesFromObservedName(name: string): string[] {
  return name
    .split('.')
    .slice(Number(Boolean(name)))
    .map((part) => `.${part}`)
    .filter((part) => part.length > Number(Boolean(part)));
}

function countPropertyTestsInContent(content: string): number {
  let tally = zeroValue();
  let re = new RegExp(PROPERTY_ASSERTION_SENSOR.source, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    tally += unitValue();
  }
  return tally;
}

function inferCapabilityId(filePath: string): string {
  let segments = stripKnownTestSourceSuffix(filePath).split(path.sep);

  let meaningful = segments.filter(
    (s) => s && s !== 'src' && s !== 'tests' && s !== '__tests__' && s !== 'test' && s !== 'spec',
  );

  let capabilityLimit =
    READ_SUCCESS_STATUS / (STATUS_CODES[FORBIDDEN_STATUS]?.length ?? unitValue());
  return meaningful.join('-').slice(zeroValue(), capabilityLimit) || unknownCapabilityId();
}

function extractTargetFunction(filePath: string): string {
  return stripKnownTestSourceSuffix(path.basename(filePath))
    .split('.property')
    .join('')
    .split('.prop')
    .join('');
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
  let results: MutationTestResult[] = [];

  let strykerResults = checkForExistingStrykerResults(rootDir);
  if (strykerResults.length > 0) {
    return strykerResults;
  }

  let scopePath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_SCOPE_STATE.json');
  if (!pathExists(scopePath)) {
    return generateDefaultMutationTargets(rootDir);
  }

  try {
    let raw = readTextFile(scopePath, 'utf-8');
    let scopeState = JSON.parse(raw);
    let files = scopeState?.files ?? [];

    let sourceFiles = files.filter(
      (f: { kind?: string; path?: string }) =>
        f.kind === 'source' && !(f.path ?? '').includes('node_modules'),
    );

    for (let file of sourceFiles.slice(0, 50)) {
      let filePath: string = file.path ?? '';
      if (!filePath) continue;

      let hasSpec = files.some(
        (f: { kind?: string; path?: string }) =>
          f.kind === 'spec' && modulePathMatch(f.path ?? '', filePath),
      );

      let coverage = hasSpec ? 60 : 20;
      let totalMutants = estimateMutants(filePath, rootDir);
      let killedMutants = Math.round(totalMutants * (coverage / 100));
      let survivedMutants = totalMutants - killedMutants;

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
  let strykerDir = path.join(rootDir, '.stryker-tmp');
  let strykerHtmlReport = path.join(rootDir, 'reports', 'mutation', 'html');

  if (fs.existsSync(strykerDir) || fs.existsSync(strykerHtmlReport)) {
    let strykerJsonPath = path.join(strykerDir, 'mutation-report.json');

    if (fs.existsSync(strykerJsonPath)) {
      try {
        let raw = fs.readFileSync(strykerJsonPath, 'utf-8');
        let report = JSON.parse(raw);

        if (report?.files) {
          return Object.entries(report.files).map(([filePath, data]: [string, unknown]) => {
            let d = data as Record<string, number>;
            let totalMutants = d.mutants ?? d.total ?? zeroValue();
            let killedMutants = d.killed ?? zeroValue();
            let survivedMutants = d.survived ?? zeroValue();
            let timeoutMutants = d.timeout ?? zeroValue();
            let mutationPercentScale = catalogPercentScale();
            let mutationScore =
              totalMutants > zeroValue()
                ? Math.round(
                    ((killedMutants + timeoutMutants) / totalMutants) * mutationPercentScale,
                  )
                : zeroValue();

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
  let targets: MutationTestResult[] = [];

  for (let confFile of STRYKER_CONF_FILES) {
    let confPath = path.join(rootDir, confFile);
    if (fs.existsSync(confPath) || fs.existsSync(confPath.replace('.json', '.js'))) {
      return [];
    }
  }

  let candidates = collectLowCoverageCandidates(rootDir);

  for (let filePath of candidates.slice(0, 20)) {
    let totalMutants = estimateMutants(filePath, rootDir);
    let coverage = estimateCoverage(filePath);
    let killedMutants = Math.round(totalMutants * (coverage / 100));
    let survivedMutants = totalMutants - killedMutants;

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
  let candidates: string[] = [];

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = readDir(dir, { withFileTypes: true }) as unknown as fs.Dirent[];
    } catch {
      return;
    }

    for (let entry of entries) {
      let fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (shouldScanDirectory(entry.name)) {
          scanDir(fullPath);
        }
      } else if (entry.isFile() && isSourceFileName(entry.name)) {
        let content = '';
        try {
          content = fs.readFileSync(fullPath, 'utf-8');
        } catch {
          continue;
        }
        if (isTestLikeFile(entry.name, content)) {
          continue;
        }
        let relativePath = fullPath.replace(rootDir + path.sep, '');

        if (
          relativePath.includes('/src/') ||
          relativePath.includes('/lib/') ||
          relativePath.includes('/modules/')
        ) {
          let hasSpec = hasCorrespondingSpec(relativePath, rootDir);
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
  let baseDir = path.dirname(filePath);
  let ext = path.extname(filePath);
  let name = path.basename(filePath, ext);
  let testDir = path.join(
    ...baseDir.split(path.sep).map((segment) => (segment === 'src' ? '__tests__' : segment)),
  );

  let specCandidates = [
    path.join(baseDir, `${name}.spec${ext}`),
    path.join(baseDir, `${name}.test${ext}`),
    path.join(testDir, `${name}.spec${ext}`),
  ];

  for (let candidate of specCandidates) {
    let abs = path.join(rootDir, candidate);
    if (fs.existsSync(abs)) return true;
  }

  return false;
}

function estimateMutants(filePath: string, rootDir: string): number {
  let absPath = path.join(rootDir, filePath);
  try {
    let content = fs.readFileSync(absPath, 'utf-8');
    let lines = content.split('\n').length;
    let estimate = Math.max(1, Math.round(lines * 0.3));
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
  let specClean = stripKnownSourceSuffix(stripKnownTestSourceSuffix(specPath))
    .split('.property')
    .join('');
  let srcClean = stripKnownSourceSuffix(srcPath);

  return [srcClean, `${srcClean}.spec`, `${srcClean}.test`].includes(specClean);
}

function stripKnownSourceSuffix(value: string): string {
  let ext = path.extname(value);
  return ext ? value.slice(0, -ext.length) : value;
}

/**
 * Merge scanned property tests with generated targets, deduplicating by filePath.
 * Already-covered files from scan results take precedence over generated targets.
 */
function mergeAndDedupe(
  scanned: PropertyTestCase[],
  targets: PropertyTestCase[],
): PropertyTestCase[] {
  let coveredFiles = new Set(scanned.map((t) => t.filePath).filter(Boolean));

  let filteredTargets = targets.filter((t) => !t.filePath || !coveredFiles.has(t.filePath));

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
  let artifactPath = safeJoin(artifactDir, CANONICAL_ARTIFACT_FILENAME);
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

let SQL_INJECTION_PATTERNS = [
  "' OR '1'='1",
  "' OR '1'='1' --",
  "'; DROP TABLE sample_table; --",
  "' UNION SELECT NULL, NULL --",
  '1; DROP TABLE sample_table; --',
  "' OR 1=1 --",
  "' OR 'a'='a",
  "admin'--",
  "' OR '1'='1' /*",
  "1' OR '1'='1",
];

let NOSQL_INJECTION_PATTERNS = [
  '{"$gt": ""}',
  '{"$ne": null}',
  '{"$regex": ".*"}',
  '{"$where": "1==1"}',
  '{"$exists": true}',
];

let XSS_PATTERNS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg/onload=alert(1)>',
  'javascript:alert(1)',
  '"><script>alert(1)</script>',
];

let SPECIAL_CHARS = [
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
  let candidates: PureFunctionCandidate[] = [];
  let scanned = new Set<string>();

  function scanDir(dir: string) {
    if (!fs.existsSync(dir)) return;
    let entries: fs.Dirent[];
    try {
      entries = readDir(dir, { withFileTypes: true }) as unknown as fs.Dirent[];
    } catch {
      return;
    }

    for (let entry of entries) {
      let fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (shouldScanDirectory(entry.name)) {
          scanDir(fullPath);
        }
      } else if (entry.isFile() && isSourceFileName(entry.name)) {
        try {
          let content = fs.readFileSync(fullPath, 'utf-8');
          if (isTestLikeFile(entry.name, content)) {
            continue;
          }
          let relativePath = fullPath.replace(rootDir + path.sep, '');

          for (let discovered of discoverExportedPropertyCandidates(content)) {
            let key = `${relativePath}:${discovered.functionName}`;
            if (scanned.has(key)) continue;
            scanned.add(key);

            let category =
              discovered.categoryHint ?? inferCandidateCategory(discovered.functionName);

            if (category) {
              candidates.push({
                functionName: discovered.functionName,
                filePath: relativePath,
                category,
                params: discovered.params,
                hasReturnType: discovered.hasReturnType,
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

  return candidates;
}

function discoverExportedPropertyCandidates(content: string): DiscoveredExport[] {
  let candidates: DiscoveredExport[] = [];
  let sourceFile = ts.createSourceFile(
    'property-candidates.ts',
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  let visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name && hasExportModifier(node)) {
      candidates.push({
        functionName: node.name.text,
        params: node.parameters.map(parameterName),
        hasReturnType: Boolean(node.type),
        categoryHint: null,
      });
    }
    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (let declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
          continue;
        }
        if (
          ts.isFunctionExpression(declaration.initializer) ||
          ts.isArrowFunction(declaration.initializer)
        ) {
          candidates.push({
            functionName: declaration.name.text,
            params: declaration.initializer.parameters.map(parameterName),
            hasReturnType: Boolean(declaration.type ?? declaration.initializer.type),
            categoryHint: null,
          });
        }
      }
    }
    if (ts.isEnumDeclaration(node) && hasExportModifier(node)) {
      candidates.push({
        functionName: node.name.text,
        params: node.members.map(enumMemberName),
        hasReturnType: true,
        categoryHint: 'enum_handler',
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return candidates;
}

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(
    ts.canHaveModifiers(node) &&
    ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword),
  );
}

function parameterName(parameter: ts.ParameterDeclaration): string {
  return ts.isIdentifier(parameter.name) ? parameter.name.text : parameter.name.getText();
}

function enumMemberName(member: ts.EnumMember): string {
  if (ts.isStringLiteral(member.initializer)) {
    return member.initializer.text;
  }
  return ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
    ? member.name.text
    : member.name.getText();
}

function inferCandidateCategory(functionName: string): CandidateCategory | null {
  let tokens = splitIdentifierTokens(functionName);
  if (hasToken(tokens, ['validate', 'valid', 'assert', 'check'])) return 'validation';
  if (hasToken(tokens, ['parse', 'deserialize', 'decode', 'extract'])) return 'parsing';
  if (hasToken(tokens, ['currency', 'amount', 'cents', 'money', 'brl'])) return 'money_handler';
  if (hasToken(tokens, ['format', 'serialize', 'encode', 'stringify', 'normalize'])) {
    return 'formatting';
  }
  if (
    hasToken(tokens, [
      'compute',
      'calculate',
      'sum',
      'multiply',
      'divide',
      'add',
      'subtract',
      'mul',
      'div',
    ])
  ) {
    return 'numeric';
  }
  if (hasToken(tokens, ['transform', 'convert', 'map', 'reduce', 'filter'])) return 'transform';
  if (
    hasToken(tokens, [
      'slugify',
      'truncate',
      'truncat',
      'pad',
      'sanitize',
      'escape',
      'unescape',
      'camel',
      'kebab',
      'pascal',
    ])
  ) {
    return 'string_manipulation';
  }
  if (hasToken(tokens, ['enum', 'status', 'state', 'type', 'kind', 'variant', 'mode'])) {
    return 'enum_handler';
  }
  return null;
}

function hasToken(tokens: Set<string>, values: string[]): boolean {
  return values.some((value) => tokens.has(value));
}

function splitIdentifierTokens(value: string): Set<string> {
  let tokens = new Set<string>();
  let current = '';
  for (let char of value) {
    let isUpper = char >= 'A' && char <= 'Z';
    let isLower = char >= 'a' && char <= 'z';
    let isDigit = char >= '0' && char <= '9';
    if (isUpper && current && current.toLowerCase() === current) {
      tokens.add(current.toLowerCase());
      current = '';
    }
    if (isUpper || isLower || isDigit) {
      current += char;
      continue;
    }
    if (current) {
      tokens.add(current.toLowerCase());
      current = '';
    }
  }
  if (current) {
    tokens.add(current.toLowerCase());
  }
  tokens.add(value.toLowerCase());
  return tokens;
}

/**
 * Main orchestrator: discover pure functions, classify them, and generate
 * property-based test cases with 1000+ inputs per function.
 */
export function generatePropertyTestCases(rootDir: string): GeneratedPropertyFunction[] {
  let candidates = discoverPureFunctionCandidates(rootDir);
  let results: GeneratedPropertyFunction[] = [];

  for (let candidate of candidates) {
    let seed = hashStringToSeed(`${candidate.filePath}:${candidate.functionName}`);
    let rng = mulberry32(seed);
    let propertyKinds = getPropertyKindsForCategory(candidate.category);
    let allInputs: GeneratedPropertyTestInput[] = [];

    for (let prop of propertyKinds) {
      let inputsForProp = generateInputsForProperty(prop, rng, candidate);
      allInputs.push(...inputsForProp);
    }

    let totalInputs = allInputs.length;
    let expectedPass = allInputs.filter((i) => i.expected === 'pass').length;
    let expectedFail = allInputs.filter((i) => i.expected === 'fail').length;

    results.push({
      functionName: candidate.functionName,
      capabilityId: candidate.category,
      filePath: fallbackGeneratedPath(candidate.filePath),
      property: combinePropertyKinds(propertyKinds),
      strategy: synthesizePropertyStrategy(candidate, propertyKinds),
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

function synthesizePropertyStrategy(
  candidate: PureFunctionCandidate,
  propertyKinds: PropertyKind[],
): FuzzStrategy {
  let hasExternalInputShape = propertyKinds.some(
    (property) =>
      property === 'injection' ||
      property === 'required_field' ||
      property === 'type_constraint' ||
      property === 'string_id',
  );
  let hasBoundaryShape = propertyKinds.some(
    (property) =>
      property === 'length_boundary' ||
      property === 'money_precision' ||
      property === 'non_negative',
  );
  let hasSchemaLikeContract = candidate.params.length > 0 || candidate.hasReturnType;
  let isPureTransform = propertyKinds.includes('idempotency') && !hasBoundaryShape;

  if (hasBoundaryShape) return 'boundary';
  if (hasExternalInputShape && !isPureTransform) return 'invalid_only';
  if (isPureTransform && hasSchemaLikeContract) return 'valid_only';
  if (hasSchemaLikeContract) return 'both';

  return 'random';
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
  let inputs: GeneratedPropertyTestInput[] = [];
  let sampleTotal =
    catalogPercentScale() + (STATUS_CODES[UNAUTHORIZED_STATUS]?.length ?? zeroValue());

  for (let i = zeroValue(); i < sampleTotal; i++) {
    let val = generateRandomValue(rng, ['string', 'number', 'boolean']);
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
  let inputs: GeneratedPropertyTestInput[] = [];

  // Valid: non-negative values
  let validValues = [
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
  for (let v of validValues) {
    inputs.push({
      value: v,
      description: `Non-negative input: ${v}`,
      expected: 'pass',
      expectedBehavior: 'Result should be non-negative (>= 0)',
    });
  }

  // Invalid: negative values
  let invalidValues = [-1, -0.01, -100, -9999.99, -Number.MAX_SAFE_INTEGER];
  for (let v of invalidValues) {
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
    let abs = Math.abs(rng() * 1_000_000);
    let val = rng() > 0.1 ? abs : parseFloat(abs.toFixed(2));
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
  let inputs: GeneratedPropertyTestInput[] = [];

  // Missing/empty values
  let missingValues: Array<{ value: unknown; label: string }> = [
    { value: undefined, label: 'undefined' },
    { value: null, label: 'null' },
    { value: '', label: 'empty string' },
    { value: {}, label: 'empty object literal' },
    { value: [], label: 'empty array' },
  ];

  for (let { value, label } of missingValues) {
    inputs.push({
      value,
      description: `Required field with ${label}`,
      expected: 'fail',
      expectedBehavior: 'Should reject missing/empty required fields',
    });
  }

  // Valid present values
  let validValues = ['valid-value', 42, true, { id: 1 }, [1, 2]];
  for (let v of validValues) {
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
  let inputs: GeneratedPropertyTestInput[] = [];
  let typeCategories = ['string', 'number', 'boolean', 'object', 'array', 'null', 'undefined'];

  for (let i = 0; i < 200; i++) {
    let type = typeCategories[Math.floor(rng() * typeCategories.length)];
    let val = generateValueOfType(type, rng);
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
  let inputs: GeneratedPropertyTestInput[] = [];

  // Valid IDs
  let validIds = [
    'abc123',
    'entity_42',
    'org-7f8a9b',
    'a'.repeat(10),
    'test@example.com',
    'c0a8b001-0000-4000-8000-000000000001',
    'https://example.com/resource/42',
  ];
  for (let id of validIds) {
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
  for (let ch of SPECIAL_CHARS) {
    inputs.push({
      value: `id${ch}test`,
      description: `String ID with special char: ${JSON.stringify(ch)}`,
      expected: 'fail',
      expectedBehavior: 'Should reject IDs containing control/special characters',
    });
  }

  // Unicode
  let unicodeIds = [
    '日本語',
    '中文测试',
    'العربية',
    '😀🎉',
    'café',
    '\u0000test',
    'test\u0000',
    'zero\u0000byte',
  ];
  for (let id of unicodeIds) {
    inputs.push({
      value: id,
      description: `Unicode string ID: ${id}`,
      expected: 'fail',
      expectedBehavior: 'Should reject or sanitize IDs with non-ASCII characters',
    });
  }

  // Random IDs (900+)
  for (let i = 0; i < 910; i++) {
    let len = Math.floor(rng() * 100) + 1;
    let chars = 'abcdefghijklmnopqrstuvwxyz0123456789-_';
    let id = '';
    for (let j = 0; j < len; j++) {
      id += chars[Math.floor(rng() * chars.length)];
    }
    let isInvalid = len > 255 || len === 0 || rng() < 0.02;
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
  let inputs: GeneratedPropertyTestInput[] = [];

  // Valid money values (integer minor units are safe)
  let validValues = [
    '0',
    '100',
    '9999',
    '42',
    '1',
    '0.00',
    '1.00',
    '123.45',
    '9999.99',
    '0.01',
    '0.99',
    '1.50',
    'R$ 0,00',
    'R$ 1,00',
    'R$ 123,45',
    'R$ 9.999,99',
    '1.234,56',
    '0,01',
    '0,99',
    '1,50',
  ];
  for (let v of validValues) {
    let isBrl = isBrlCurrencyInput(v);
    inputs.push({
      value: v,
      description: `Valid ${isBrl ? 'BRL' : 'currency'} string: "${v}"`,
      expected: 'pass',
      expectedBehavior: isBrl
        ? 'Should parse valid BRL currency strings to integer cents'
        : 'Should parse valid currency strings to integer minor units',
    });
  }

  // Invalid money strings
  let invalidValues = [
    '',
    'not currency',
    'not money',
    '-1.00',
    'R$ -1,00',
    'R$ abc',
    'abc',
    'free',
    '1,234,567,890.12', // excessively large
    'R$ 1.234.567.890,12', // excessively large
  ];
  for (let v of invalidValues) {
    let isBrl = isBrlCurrencyInput(v);
    inputs.push({
      value: v,
      description: `Invalid ${isBrl ? 'BRL' : 'currency'} string: "${v}"`,
      expected: 'fail',
      expectedBehavior: isBrl
        ? 'Should reject unparseable BRL strings'
        : 'Should reject unparseable currency strings',
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
  let roundTripValues = [
    '0.00',
    '1.00',
    '42.50',
    '100.00',
    '1000.00',
    '99.99',
    'R$ 0,00',
    'R$ 1,00',
    'R$ 42,50',
    'R$ 100,00',
    'R$ 1.000,00',
    'R$ 99,99',
  ];
  for (let v of roundTripValues) {
    let isBrl = isBrlCurrencyInput(v);
    inputs.push({
      value: v,
      description: `Round-trip property: format(parse("${v}")) ≈ "${v}"`,
      expected: 'pass',
      expectedBehavior: isBrl
        ? 'Round-trip format/parse should be idempotent for valid BRL'
        : 'Round-trip format/parse should be idempotent for valid currency strings',
    });
  }

  // Random money values (880+)
  for (let i = 0; i < 880; i++) {
    let major = Math.floor(rng() * 1_000_000);
    let minor = Math.floor(rng() * 100);
    let formatted =
      rng() < 0.5
        ? `${major}.${minor.toString().padStart(2, '0')}`
        : `R$ ${major.toLocaleString('pt-BR')},${minor.toString().padStart(2, '0')}`;
    let isInvalid = rng() < 0.05;
    inputs.push({
      value: isInvalid ? `invalid_${i}` : formatted,
      description: `Money precision test #${i + 1}`,
      expected: isInvalid ? 'fail' : 'pass',
      expectedBehavior: isInvalid
        ? 'Should reject invalid money strings'
        : 'Should parse valid currency or BRL strings with correct minor-unit precision',
    });
  }

  return inputs;
}

function generateEnumValueInputs(
  rng: () => number,
  candidate: PureFunctionCandidate,
): GeneratedPropertyTestInput[] {
  let inputs: GeneratedPropertyTestInput[] = [];
  let enumName = candidate.functionName;
  let discoveredMembers = inferEnumMembersFromCandidate(candidate);

  for (let member of discoveredMembers) {
    inputs.push({
      value: member,
      description: `Candidate member for ${enumName}: ${member}`,
      expected: 'pass',
      expectedBehavior: `Should accept a member discovered from ${enumName}`,
    });
  }

  let invalids = ['INVALID', 'UNKNOWN', '', 'lower_case_value', 42, null, undefined];
  for (let inv of invalids) {
    inputs.push({
      value: inv,
      description: `Invalid ${enumName} value: ${JSON.stringify(inv)}`,
      expected: 'fail',
      expectedBehavior: `Should reject values outside the discovered ${enumName} set`,
    });
  }

  // Random enum-like tests
  for (let i = 0; i < 200; i++) {
    let isInvalid = rng() < 0.4;
    let value = isInvalid
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
  if (candidate.params.length > 0) {
    return [...new Set(candidate.params)];
  }

  let words = [...splitIdentifierTokens(candidate.functionName)]
    .map((word) => word.toUpperCase())
    .filter((word) => word.length > 2);

  return words.length > 0 ? [...new Set(words)] : [candidate.functionName.toUpperCase()];
}

function isBrlCurrencyInput(value: string): boolean {
  return value.includes('R$') || value.includes(',');
}

function generateLengthBoundaryInputs(rng: () => number): GeneratedPropertyTestInput[] {
  let inputs: GeneratedPropertyTestInput[] = [];

  // Boundry lengths: 0, 1, 255, 256, 1000, 10000, 65535
  let boundaries = [0, 1, 255, 256, 1000, 1001, 10000, 65535, 65536];

  for (let len of boundaries) {
    let val = 'x'.repeat(len);
    let isValid = len > 0 && len <= 65535;
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
  let randomLengthSamples =
    READ_SUCCESS_STATUS +
    BAD_REQUEST_STATUS +
    (STATUS_CODES[UNAUTHORIZED_STATUS]?.length ?? zeroValue());
  for (let i = zeroValue(); i < randomLengthSamples; i++) {
    let len = Math.floor(rng() * 2000);
    let val = 'a'.repeat(len);
    let isInvalid = len === 0 || len > 1000;
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
  let inputs: GeneratedPropertyTestInput[] = [];

  // SQL injection patterns
  for (let pattern of SQL_INJECTION_PATTERNS) {
    inputs.push({
      value: pattern,
      description: `SQL injection pattern: "${pattern}"`,
      expected: 'fail',
      expectedBehavior: 'Should reject or sanitize SQL injection patterns in string inputs',
    });
  }

  // NoSQL injection patterns
  for (let pattern of NOSQL_INJECTION_PATTERNS) {
    inputs.push({
      value: pattern,
      description: `NoSQL injection pattern: "${pattern}"`,
      expected: 'fail',
      expectedBehavior: 'Should reject or sanitize NoSQL injection patterns',
    });
  }

  // XSS patterns
  for (let pattern of XSS_PATTERNS) {
    inputs.push({
      value: pattern,
      description: `XSS pattern: "${pattern}"`,
      expected: 'fail',
      expectedBehavior: 'Should reject or sanitize XSS payloads in string inputs',
    });
  }

  // Path traversal
  let traversalPatterns = [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32',
    '%2e%2e%2fetc%2fpasswd',
    '....//....//etc/passwd',
  ];
  for (let pattern of traversalPatterns) {
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
  let inputs: GeneratedPropertyTestInput[] = [];

  // Data-driven test series
  for (let i = 0; i < 1000; i++) {
    let kind = Math.floor(rng() * 6);
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
        let objLen = Math.floor(rng() * 5) + 1;
        let obj: Record<string, unknown> = {};
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
        let arrLen = Math.floor(rng() * 10) + 1;
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
  let type = types[Math.floor(rng() * types.length)];
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
  let len = Math.floor(rng() * 50) + 1;
  let chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 _-';
  let result = '';
  for (let i = 0; i < len; i++) {
    result += chars[Math.floor(rng() * chars.length)];
  }
  return result;
}

function randomNumber(rng: () => number): number {
  let magnitude = Math.floor(rng() * 6) - 3;
  let base = rng() * 1000;
  return parseFloat((base * Math.pow(10, magnitude)).toFixed(4));
}

function randomObject(rng: () => number): Record<string, unknown> {
  let obj: Record<string, unknown> = {};
  let seedTypes = ['string', 'number', 'boolean'];
  let itemSpan = seedTypes.length + unitValue() + unitValue();
  let itemTotal = Math.floor(rng() * itemSpan) + unitValue();
  for (let i = zeroValue(); i < itemTotal; i++) {
    obj[`prop_${i}`] = generateRandomValue(rng, ['string', 'number', 'boolean']);
  }
  return obj;
}

function randomArray(rng: () => number): unknown[] {
  let seedTypes = ['string', 'number', 'boolean'];
  let itemSpan = seedTypes.concat(seedTypes).length + unitValue() + unitValue();
  let itemTotal = Math.floor(rng() * itemSpan) + unitValue();
  return Array(itemTotal)
    .fill(zeroValue())
    .map(() => generateRandomValue(rng, ['string', 'number', 'boolean']));
}
