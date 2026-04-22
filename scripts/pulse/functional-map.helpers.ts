import * as fs from 'fs';
import * as path from 'path';
import { safeJoin, safeResolve } from './safe-path';
import type { APICall, UIElement } from './types';
import type { HookRegistry } from './parsers/hook-registry';
import type { PageEntry } from './functional-map-types';
import { normalizeForMatch } from './graph';

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
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  if (fs.existsSync(resolved)) {
    return resolved;
  }

  return null;
}

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
      if (handler.includes(funcName)) {
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
    if (handler.includes(funcName)) {
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
  const funcDefRe = new RegExp(
    `(?:const|let|function|async function)\\s+${funcName}\\s*(?:=|\\()`,
    'g',
  );
  const defMatch = funcDefRe.exec(fileContent);
  if (!defMatch) {
    return null;
  }

  const defIdx = fileContent.substring(0, defMatch.index).split('\n').length - 1;
  const lines = fileContent.split('\n');
  const bodyText = lines.slice(defIdx, Math.min(defIdx + 40, lines.length)).join('\n');

  const apiMatch = bodyText.match(
    /apiFetch\s*(?:<[^>]*>)?\s*\(\s*(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/,
  );
  if (apiMatch) {
    const endpoint = (apiMatch[1] || apiMatch[2]).replace(/\$\{[^}]+\}/g, ':param');
    return {
      endpoint,
      method: detectMethodFromBody(bodyText),
      file: element.file,
      line: element.line,
    };
  }

  for (const [, funcMap] of hookRegistry) {
    for (const [funcName, hookFunc] of funcMap) {
      if (new RegExp(`\\b${funcName}\\s*\\(`).test(bodyText)) {
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
    if (new RegExp(`\\b${funcName}\\s*[.(]`).test(bodyText)) {
      return { endpoint, method, file: element.file, line: element.line };
    }
  }

  return null;
}

export function detectMethodFromBody(body: string): string {
  const match = body.match(/method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i);
  if (match) {
    return match[1].toUpperCase();
  }
  if (/\.post\s*\(/i.test(body)) {
    return 'POST';
  }
  if (/\.put\s*\(/i.test(body)) {
    return 'PUT';
  }
  if (/\.patch\s*\(/i.test(body)) {
    return 'PATCH';
  }
  if (/\.delete\s*\(/i.test(body)) {
    return 'DELETE';
  }
  return 'POST';
}
