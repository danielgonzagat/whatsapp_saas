import * as path from 'path';
import { safeJoin, safeResolve } from './safe-path';
import type { APICall, UIElement } from './types';
import type { HookRegistry } from './parsers/hook-registry';
import type { PageEntry } from './functional-map-types';
import { normalizeForMatch } from './graph';
import { pathExists } from './safe-fs';

function isIdentifierChar(value: string | undefined): boolean {
  return Boolean(value && /[\w$]/.test(value));
}

function hasIdentifierAt(text: string, offset: number, identifier: string): boolean {
  if (!text.startsWith(identifier, offset)) {
    return false;
  }
  return !isIdentifierChar(text[offset - 1]) && !isIdentifierChar(text[offset + identifier.length]);
}

function hasFunctionCall(text: string, funcName: string): boolean {
  let offset = text.indexOf(funcName);
  while (offset !== -1) {
    if (hasIdentifierAt(text, offset, funcName)) {
      let cursor = offset + funcName.length;
      while (/\s/.test(text[cursor] || '')) {
        cursor += 1;
      }
      if (text[cursor] === '(') {
        return true;
      }
    }
    offset = text.indexOf(funcName, offset + funcName.length);
  }
  return false;
}

function hasMemberCall(text: string, objectName: string, methodName: string): boolean {
  let offset = text.indexOf(objectName);
  while (offset !== -1) {
    if (hasIdentifierAt(text, offset, objectName)) {
      let cursor = offset + objectName.length;
      while (/\s/.test(text[cursor] || '')) {
        cursor += 1;
      }
      if (text[cursor] === '.') {
        cursor += 1;
        while (/\s/.test(text[cursor] || '')) {
          cursor += 1;
        }
        if (!hasIdentifierAt(text, cursor, methodName)) {
          offset = text.indexOf(objectName, offset + objectName.length);
          continue;
        }
        cursor += methodName.length;
        while (/\s/.test(text[cursor] || '')) {
          cursor += 1;
        }
        if (text[cursor] === '(') {
          return true;
        }
      }
    }
    offset = text.indexOf(objectName, offset + objectName.length);
  }
  return false;
}

function findFunctionDeclarationIndex(lines: string[], funcName: string): number {
  return lines.findIndex((line) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith(`function ${funcName}`)) {
      return true;
    }
    if (trimmed.startsWith(`async function ${funcName}`)) {
      return true;
    }
    return trimmed.startsWith(`const ${funcName}`) || trimmed.startsWith(`let ${funcName}`);
  });
}

function handlerCallsFunction(handler: string, funcName: string): boolean {
  return handler.trim() === funcName || hasFunctionCall(handler, funcName);
}

function handlerCallsApiModule(handler: string, callName: string): boolean {
  const [objectName, methodName] = callName.split('.');
  if (methodName) {
    return hasMemberCall(handler, objectName, methodName);
  }

  return handlerCallsFunction(handler, callName);
}

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
  const lines = fileContent.split('\n');
  const defIdx = findFunctionDeclarationIndex(lines, funcName);
  if (defIdx === -1) {
    return null;
  }

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
