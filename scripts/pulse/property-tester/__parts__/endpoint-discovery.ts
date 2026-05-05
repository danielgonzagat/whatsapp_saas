import * as path from 'path';
import * as fs from 'node:fs';
import * as ts from 'typescript';
import type { PulseStructuralGraph, PulseStructuralNode } from '../../types';
import { pathExists, readTextFile, readDir } from '../../safe-fs';
import { safeJoin } from '../../lib/safe-path';
import { isObservedHttpEntrypointMethod } from '../../dynamic-reality-grammar';
import {
  deriveUnitValue,
  deriveZeroValue,
  discoverAllObservedArtifactFilenames,
  discoverRouteSeparatorFromRuntime,
  discoverStructuralNodeKindLabels,
  hasObservedToken,
  splitIdentifierTokensFromObservedName,
} from '../../dynamic-reality-kernel';
import { du8, isStringEvidence, splitWhitespace } from './core';

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

export {
  shouldScanDirectory,
  isSourceFileName,
  isTestLikeFile,
  hasTestFileNameEvidence,
  splitFileNameEvidenceParts,
  hasPropertyEvidence,
  hasTestRuntimeEvidence,
  hasFastCheckImportEvidence,
} from './core';

/**
 * Discover API endpoints from the structural graph artifact, or fall back to
 * a lightweight source-code scan when the artifact is unavailable.
 *
 * @param rootDir  Absolute path to the repository root.
 * @returns        List of endpoint descriptors with method, path, and filePath.
 */
export function discoverEndpoints(rootDir: string): EndpointDescriptor[] {
  let structuralPath = safeJoin(
    rootDir,
    '.pulse',
    'current',
    discoverAllObservedArtifactFilenames().structuralGraph,
  );

  if (pathExists(structuralPath)) {
    try {
      let raw = readTextFile(structuralPath, du8());
      let graph: PulseStructuralGraph = JSON.parse(raw);
      let endpoints: EndpointDescriptor[] = [];

      for (let node of graph.nodes) {
        if (
          discoverStructuralNodeKindLabels().has(node.kind) &&
          hasObservedToken(splitIdentifierTokensFromObservedName(node.kind), ['route'])
        ) {
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
    labelParts.length >= deriveUnitValue() + deriveUnitValue() &&
    isObservedHttpEntrypointMethod(labelParts[deriveZeroValue()])
  ) {
    return normalizeRoute(labelParts[1]);
  }

  return null;
}

export function normalizeRoute(value: string): string {
  let output: string[] = [];
  for (let char of String(value || '').trim()) {
    if (char === discoverRouteSeparatorFromRuntime()) {
      if (output[output.length - deriveUnitValue()] !== discoverRouteSeparatorFromRuntime()) {
        output.push(char);
      }
      continue;
    }
    output.push(char);
  }
  while (
    output.length > deriveUnitValue() &&
    output[output.length - deriveUnitValue()] === discoverRouteSeparatorFromRuntime()
  ) {
    output.pop();
  }
  return output.join('') || discoverRouteSeparatorFromRuntime();
}

/**
 * Fallback: discover endpoints by scanning source files for NestJS HTTP method
 * decorators (Get, Post, Put, Delete, Patch) combined with Controller decorators.
 */
export function discoverEndpointsFromSource(rootDir: string): EndpointDescriptor[] {
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

export function joinRoutes(prefix: string, route: string): string {
  let normalizedPrefix = prefix === discoverRouteSeparatorFromRuntime() || !prefix ? '' : prefix;
  let normalizedRoute = route === discoverRouteSeparatorFromRuntime() || !route ? '' : route;

  if (!normalizedPrefix) return normalizedRoute || discoverRouteSeparatorFromRuntime();
  if (!normalizedRoute) return normalizedPrefix || discoverRouteSeparatorFromRuntime();

  return `${normalizedPrefix}${normalizedRoute}`;
}

/**
 * Fallback scan targeting the backend/src directory structure specifically.
 */
export function discoverEndpointsFromBackendDir(rootDir: string): EndpointDescriptor[] {
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

export function discoverControllerEndpoints(
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

export function findHttpDecorator(node: ts.Node): { name: string; route: string | null } | null {
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

export function findDecoratorStringArg(node: ts.Node, decoratorName: string): string | null {
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
