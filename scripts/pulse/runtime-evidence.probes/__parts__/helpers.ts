/**
 * Pulse runtime probe internal helpers.
 * Private utilities shared by probe implementations.
 */
import * as fs from 'fs';
import * as path from 'path';
import { METHODS as HTTP_METHODS } from 'node:http';
import {
  deriveUnitValue,
  deriveZeroValue,
  discoverAllObservedArtifactFilenames,
  discoverDirectorySkipHintsFromEvidence,
  discoverGateFailureClassLabels,
  discoverNestjsDecoratorNamesFromTypeEvidence,
  discoverRuntimeProbeStatusLabels,
  discoverSourceExtensionsFromObservedTypescript,
} from '../../dynamic-reality-kernel';

function getRuntimeEvidencePath(): string {
  return discoverAllObservedArtifactFilenames().runtimeEvidence || 'PULSE_RUNTIME_EVIDENCE.json';
}
function getRuntimeProbesPath(): string {
  return discoverAllObservedArtifactFilenames().runtimeProbes || 'PULSE_RUNTIME_PROBES.json';
}
const RUNTIME_EVIDENCE_PATH = getRuntimeEvidencePath();
const RUNTIME_PROBES_PATH = getRuntimeProbesPath();
const PROBE_ARTIFACT_PATHS = [RUNTIME_EVIDENCE_PATH, RUNTIME_PROBES_PATH];

function probeStatusFailed(): string {
  return [...discoverRuntimeProbeStatusLabels()].sort()[deriveZeroValue()];
}
function probeStatusMissingEvidence(): string {
  return [...discoverRuntimeProbeStatusLabels()].sort()[deriveUnitValue()];
}
function probeStatusPassed(): string {
  return [...discoverRuntimeProbeStatusLabels()].sort()[deriveUnitValue() + deriveUnitValue()];
}
function failureClassMissingEvidence(): string {
  return [...discoverGateFailureClassLabels()].sort()[deriveUnitValue()];
}
function failureClassProductFailure(): string {
  return [...discoverGateFailureClassLabels()].sort()[deriveUnitValue() + deriveUnitValue()];
}
function isMissingEvidenceFailure(fc: string): boolean {
  return failureClassMissingEvidence() === fc;
}

interface DiscoveredHttpRoute {
  method: string;
  path: string;
  file: string;
  guarded: boolean;
}

function normalizeRoutePath(routePath: string): string {
  const normalized = routePath
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
  return `/${normalized}`;
}

function listTypeScriptFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return discoverDirectorySkipHintsFromEvidence().has(entry.name)
        ? []
        : listTypeScriptFiles(fullPath);
    }
    return entry.isFile() &&
      discoverSourceExtensionsFromObservedTypescript().has(path.extname(entry.name)) &&
      !entry.name.endsWith('.spec.ts')
      ? [fullPath]
      : [];
  });
}

function readOptionalText(filePath: string): string {
  try {
    return fs.readFileSync(filePath).toString();
  } catch {
    return '';
  }
}

function parseDecoratorPath(source: string, decoratorName: string): string | null {
  const decoratorIndex = source.indexOf(`@${decoratorName}`);
  if (decoratorIndex === -1) {
    return null;
  }
  const openParen = source.indexOf('(', decoratorIndex);
  const closeParen = openParen === -1 ? -1 : source.indexOf(')', openParen);
  if (openParen === -1 || closeParen === -1) {
    return '';
  }
  const rawArgument = source.slice(openParen + 1, closeParen).trim();
  const quoted = /^['"`]([^'"`]*)['"`]$/.exec(rawArgument);
  return quoted?.[1] ?? '';
}

function discoverBackendRoutes(rootDir: string = process.cwd()): DiscoveredHttpRoute[] {
  const backendSourceDir = path.join(rootDir, 'backend', 'src');
  const METHOD_SET = new Set<string>(HTTP_METHODS);
  const nestjsDecorators = discoverNestjsDecoratorNamesFromTypeEvidence();
  const methodDecorators = new Map<string, string>();
  for (const name of nestjsDecorators) {
    const upper = name.toUpperCase();
    if (METHOD_SET.has(upper)) {
      methodDecorators.set(name, upper);
    }
  }
  const routes: DiscoveredHttpRoute[] = [];

  for (const file of listTypeScriptFiles(backendSourceDir)) {
    const source = readOptionalText(file);
    const controllerBase = parseDecoratorPath(source, 'Controller');
    if (controllerBase === null) {
      continue;
    }
    const guarded = source.includes('@UseGuards') || source.includes('Guard)');
    const lines = source.split('\n');
    for (const line of lines) {
      for (const [decoratorName, method] of methodDecorators) {
        const routePart = parseDecoratorPath(line, decoratorName);
        if (routePart === null) {
          continue;
        }
        routes.push({
          method,
          path: normalizeRoutePath([controllerBase, routePart].filter(Boolean).join('/')),
          file,
          guarded,
        });
      }
    }
  }

  return routes;
}

function routeLooksLikeHealthCapability(route: DiscoveredHttpRoute): boolean {
  const evidence = `${route.path} ${path.basename(route.file)}`.toLowerCase();
  return route.method === 'GET' && (evidence.includes('health') || evidence.includes('ping'));
}

function routeLooksUsableAfterAuth(route: DiscoveredHttpRoute): boolean {
  return route.method === 'GET' && route.guarded && !routeLooksLikeHealthCapability(route);
}

function selectHealthProbePaths(): string[] {
  return discoverBackendRoutes()
    .filter(routeLooksLikeHealthCapability)
    .map((route) => route.path)
    .sort((left, right) => left.length - right.length);
}

function selectAuthenticatedReadPaths(): string[] {
  const routes = discoverBackendRoutes()
    .filter(routeLooksUsableAfterAuth)
    .map((route) => route.path)
    .filter((routePath) => !routePath.includes(':'))
    .sort((left, right) => left.length - right.length);
  return [...new Set(routes)];
}

export {
  PROBE_ARTIFACT_PATHS,
  RUNTIME_EVIDENCE_PATH,
  RUNTIME_PROBES_PATH,
  failureClassMissingEvidence,
  failureClassProductFailure,
  isMissingEvidenceFailure,
  probeStatusFailed,
  probeStatusMissingEvidence,
  probeStatusPassed,
  selectAuthenticatedReadPaths,
  selectHealthProbePaths,
};
