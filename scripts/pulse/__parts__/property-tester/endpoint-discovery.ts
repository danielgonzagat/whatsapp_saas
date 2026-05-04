import * as path from 'path';
import * as fs from 'node:fs';
import * as ts from 'typescript';
import type { PulseStructuralGraph, PulseStructuralNode } from '../../types';
import type {
  EndpointDescriptor,
  EndpointProofProfile,
  ProofInputType,
  EntrypointType,
  StateEffect,
  EndpointRisk,
  HttpStatusText,
} from './types';
import { pathExists, readTextFile, readDir } from '../../safe-fs';
import { safeJoin } from '../../lib/safe-path';
import {
  isObservedDestructiveMethod,
  isObservedHttpEntrypointMethod,
  isObservedMutatingMethod,
  observedMethodAcceptsBody,
} from '../../dynamic-reality-grammar';
import {
  deriveHttpStatusFromObservedCatalog as httpStatus,
  discoverDestructiveEffectsFromTypeEvidence,
  discoverMutatingEffectsFromTypeEvidence,
  discoverPublicExposuresFromTypeEvidence,
  discoverProtectedExposuresFromTypeEvidence,
} from '../../dynamic-reality-kernel';
import {
  du8,
  shouldScanDirectory,
  isSourceFileName,
  isStringEvidence,
  routeSeparator,
  unitValue,
  zeroValue,
  isRootRoute,
  fallbackRootRoute,
  splitWhitespace,
  lastIndex,
  hasQueryParameter,
  hasToken,
  splitIdentifierTokens,
} from './util';

export function normalizeRoute(value: string): string {
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

export function joinRoutes(prefix: string, route: string): string {
  let normalizedPrefix = isRootRoute(prefix) || !prefix ? '' : prefix;
  let normalizedRoute = isRootRoute(route) || !route ? '' : route;

  if (!normalizedPrefix) return fallbackRootRoute(normalizedRoute);
  if (!normalizedRoute) return fallbackRootRoute(normalizedPrefix);

  return `${normalizedPrefix}${normalizedRoute}`;
}

export function extractHttpMethod(node: PulseStructuralNode): string | null {
  let metaMethod = node.metadata['method'];
  if (isStringEvidence(metaMethod)) return metaMethod.toUpperCase();

  let metaHttp = node.metadata['httpMethod'];
  if (isStringEvidence(metaHttp)) return metaHttp.toUpperCase();

  return null;
}

export function extractRoute(node: PulseStructuralNode): string | null {
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

export function discoverEndpoints(rootDir: string): EndpointDescriptor[] {
  let structuralPath = safeJoin(rootDir, '.pulse', 'current', 'PULSE_STRUCTURAL_GRAPH.json');

  if (pathExists(structuralPath)) {
    try {
      let raw = readTextFile(structuralPath, du8());
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
          let content = fs.readFileSync(fullPath, du8());
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
          let content = fs.readFileSync(fullPath, du8());
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

export function classifyEndpointRisk(endpoint: string | EndpointDescriptor): EndpointRisk {
  let proofShape = buildEndpointProofProfile(
    isStringEvidence(endpoint) ? { method: 'GET', path: endpoint, filePath: '' } : endpoint,
  );

  if (discoverDestructiveEffectsFromTypeEvidence().has(proofShape.stateEffect)) return 'high';
  if (
    proofShape.hasExternalEffect &&
    !discoverProtectedExposuresFromTypeEvidence().has(proofShape.runtimeExposure)
  ) {
    return 'high';
  }
  if (
    discoverMutatingEffectsFromTypeEvidence().has(proofShape.stateEffect) &&
    discoverPublicExposuresFromTypeEvidence().has(proofShape.runtimeExposure)
  ) {
    return 'high';
  }
  if (
    discoverMutatingEffectsFromTypeEvidence().has(proofShape.stateEffect) &&
    (proofShape.hasSchema || proofShape.inputTypes.has('path_parameter'))
  ) {
    return 'high';
  }
  if (
    discoverMutatingEffectsFromTypeEvidence().has(proofShape.stateEffect) ||
    proofShape.hasExternalEffect
  )
    return 'medium';
  if (proofShape.inputTypes.has('path_parameter') && proofShape.inputTypes.has('query_parameter')) {
    return 'medium';
  }

  return 'low';
}

export function buildEndpointProofProfile(endpoint: EndpointDescriptor): EndpointProofProfile {
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
