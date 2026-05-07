import * as path from 'path';
import { safeJoin } from '../../safe-path';
import type { APICall, UIElement } from '../../types.core';
import type { HookRegistry } from '../../parsers/hook-registry';
import type { PageEntry } from '../../functional-map-types';
import { normalizeForMatch } from '../../graph/__parts__/graph-part1-core';
import { pathExists } from '../../safe-fs';
import {
  extractDirectApiFromBody,
  extractFunctionBody,
  findApiCallInLocalFunction,
  handlerCallsApiModule,
  handlerCallsFunction,
} from './ast-utils';

export { detectMethodFromBody } from './ast-utils';

/** Resolve import path. */
export function resolveImportPath(importPath: string, frontendDir: string): string | null {
  let resolved: string;

  if (importPath.startsWith('@/')) {
    resolved = safeJoin(frontendDir, importPath.slice(2));
  } else if (importPath.startsWith('./') || importPath.startsWith('../')) {
    return null;
  } else {
    return null;
  }

  for (const ext of ['.tsx', '.ts', '/index.tsx', '/index.ts']) {
    const candidate = resolved + ext;
    if (pathExists(candidate)) {
      return candidate;
    }
  }
  if (pathExists(resolved)) {
    return resolved;
  }

  return null;
}

/** Group elements by page. */
export function groupElementsByPage(
  pages: PageEntry[],
  pageComponentTrees: Map<string, string[]>,
  uiElements: UIElement[],
  rootDir: string,
): Map<string, UIElement[]> {
  const fileToPages = new Map<string, Set<string>>();
  for (const page of pages) {
    const tree = pageComponentTrees.get(page.route) || [];
    for (const absFile of tree) {
      const relFile = path.relative(rootDir, absFile);
      if (!fileToPages.has(relFile)) {
        fileToPages.set(relFile, new Set());
      }
      fileToPages.get(relFile)?.add(page.route);
    }
  }

  const result = new Map<string, UIElement[]>();
  for (const page of pages) {
    result.set(page.route, []);
  }

  for (const element of uiElements) {
    const pageRoutes = fileToPages.get(element.file);
    if (!pageRoutes) {
      continue;
    }
    for (const route of pageRoutes) {
      result.get(route)?.push(element);
    }
  }

  return result;
}

/** Find api call for endpoint. */
export function findApiCallForEndpoint(endpoint: string, apiCalls: APICall[]): APICall | null {
  for (const call of apiCalls) {
    if (call.endpoint === endpoint || call.normalizedPath === endpoint) {
      return call;
    }
  }
  const norm = normalizeForMatch(endpoint);
  for (const call of apiCalls) {
    if (normalizeForMatch(call.normalizedPath) === norm) {
      return call;
    }
  }
  return null;
}

/** Find api call for element. */
export function findApiCallForElement(
  element: UIElement,
  apiCalls: APICall[],
  hookRegistry: HookRegistry,
  apiModuleMap: Map<string, { endpoint: string; method: string }>,
  fileContent: string,
): { endpoint: string; method: string; file: string; line: number } | null {
  if (element.apiCalls.length > 0) {
    for (const endpoint of element.apiCalls) {
      const call = findApiCallForEndpoint(endpoint, apiCalls);
      if (call) {
        return {
          endpoint: call.normalizedPath,
          method: call.method,
          file: call.file,
          line: call.line,
        };
      }
      return { endpoint, method: 'POST', file: element.file, line: element.line };
    }
  }

  if (!element.handler) {
    return null;
  }

  const handler = element.handler;
  for (const [, funcMap] of hookRegistry) {
    for (const [funcName, hookFunc] of funcMap) {
      if (handlerCallsFunction(handler, funcName)) {
        return {
          endpoint: hookFunc.endpoint,
          method: hookFunc.method,
          file: element.file,
          line: element.line,
        };
      }
    }
  }

  for (const [funcName, { endpoint, method }] of apiModuleMap) {
    if (handlerCallsApiModule(handler, funcName)) {
      return { endpoint, method, file: element.file, line: element.line };
    }
  }

  if (!fileContent) {
    return null;
  }

  const funcNameMatch = handler.match(/^(\w+)$/);
  if (!funcNameMatch) {
    return null;
  }

  const funcName = funcNameMatch[1];
  const bodyText = extractFunctionBody(fileContent, funcName);
  if (!bodyText) {
    return null;
  }

  const directApi = extractDirectApiFromBody(bodyText);
  if (directApi) {
    return {
      endpoint: directApi.endpoint,
      method: directApi.method,
      file: element.file,
      line: element.line,
    };
  }

  for (const [, funcMap] of hookRegistry) {
    for (const [funcName, hookFunc] of funcMap) {
      if (handlerCallsFunction(bodyText, funcName)) {
        return {
          endpoint: hookFunc.endpoint,
          method: hookFunc.method,
          file: element.file,
          line: element.line,
        };
      }
    }
  }

  for (const [funcName, { endpoint, method }] of apiModuleMap) {
    if (handlerCallsApiModule(bodyText, funcName)) {
      return { endpoint, method, file: element.file, line: element.line };
    }
  }

  const nested = findApiCallInLocalFunction(
    fileContent,
    funcName,
    hookRegistry,
    apiModuleMap,
    new Set<string>(),
  );
  if (nested) {
    return { ...nested, file: element.file, line: element.line };
  }

  return null;
}
