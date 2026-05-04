import * as path from 'path';
import { safeJoin, safeResolve } from './safe-path';
import type { APICall, UIElement } from './types';
import type { HookRegistry } from './parsers/hook-registry';
import type { PageEntry } from './functional-map-types';
import { normalizeForMatch } from './graph';
import { pathExists } from './safe-fs';
import { normalizeEndpoint } from './parsers/api-parser';

function isIdentifierChar(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return (
    (value >= 'a' && value <= 'z') ||
    (value >= 'A' && value <= 'Z') ||
    (value >= '0' && value <= '9') ||
    value === '_' ||
    value === '$'
  );
}

function isWhitespaceChar(value: string | undefined): boolean {
  return (
    value === ' ' ||
    value === '\t' ||
    value === '\n' ||
    value === '\r' ||
    value === '\f' ||
    value === '\v'
  );
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
      while (isWhitespaceChar(text[cursor])) {
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
      while (isWhitespaceChar(text[cursor])) {
        cursor += 1;
      }
      if (text[cursor] === '.') {
        cursor += 1;
        while (isWhitespaceChar(text[cursor])) {
          cursor += 1;
        }
        if (!hasIdentifierAt(text, cursor, methodName)) {
          offset = text.indexOf(objectName, offset + objectName.length);
          continue;
        }
        cursor += methodName.length;
        while (isWhitespaceChar(text[cursor])) {
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

function extractFunctionBody(fileContent: string, funcName: string, maxLines = 90): string {
  const funcDefRe =
    /(?:const|let|function|async function)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:=|\()/g;
  const defMatch = [...fileContent.matchAll(funcDefRe)].find((match) => match[1] === funcName);
  if (!defMatch) {
    return '';
  }

  const lines = fileContent.split('\n');
  const defIdx = fileContent.substring(0, defMatch.index).split('\n').length - 1;
  let depth = 0;
  let bodyStarted = false;
  let endIdx = Math.min(defIdx + maxLines, lines.length);
  const firstLine = lines[defIdx] || '';
  const waitForArrowBody = /(?:const|let)\s+\w+\s*=/.test(firstLine);
  let arrowBodySeen = !waitForArrowBody;

  for (let index = defIdx; index < Math.min(defIdx + maxLines, lines.length); index++) {
    const line = lines[index] || '';
    let scanFrom = 0;
    if (!arrowBodySeen) {
      const arrowIdx = line.indexOf('=>');
      if (arrowIdx === -1) {
        continue;
      }
      arrowBodySeen = true;
      scanFrom = arrowIdx + 2;
    }

    for (const ch of line.slice(scanFrom)) {
      if (ch === '{') {
        depth++;
        bodyStarted = true;
      } else if (ch === '}') {
        depth--;
      }
    }
    if (bodyStarted && depth <= 0) {
      endIdx = index + 1;
      break;
    }
  }

  return lines.slice(defIdx, endIdx).join('\n');
}

function extractDirectApiFromBody(
  bodyText: string,
): { endpoint: string; method: string; file: string; line: number } | null {
  for (const functionName of ['apiFetch', 'apiUrl', 'fetch']) {
    let cursor = 0;
    while (cursor < bodyText.length) {
      const openParenIndex = findFunctionCallOpenParen(bodyText, functionName, cursor);
      if (openParenIndex === -1) {
        break;
      }
      const raw = extractFirstStringLikeArgument(bodyText, openParenIndex);
      const endpoint = raw ? normalizeStringLikeEndpoint(raw) : null;
      if (!endpoint) {
        cursor = openParenIndex + 1;
        continue;
      }
      return {
        endpoint,
        method: detectMethodFromBody(bodyText),
        file: '',
        line: 0,
      };
    }
  }

  return null;
}

function findFunctionCallOpenParen(text: string, functionName: string, fromOffset: number): number {
  let offset = text.indexOf(functionName, fromOffset);
  while (offset !== -1) {
    if (hasIdentifierAt(text, offset, functionName)) {
      let cursor = offset + functionName.length;
      while (isWhitespaceChar(text[cursor])) {
        cursor += 1;
      }
      if (text[cursor] === '<') {
        let depth = 0;
        while (cursor < text.length) {
          if (text[cursor] === '<') {
            depth += 1;
          } else if (text[cursor] === '>') {
            depth -= 1;
            if (depth === 0) {
              cursor += 1;
              break;
            }
          } else if (text[cursor] === '\n') {
            break;
          }
          cursor += 1;
        }
        while (isWhitespaceChar(text[cursor])) {
          cursor += 1;
        }
      }
      if (text[cursor] === '(') {
        return cursor;
      }
    }
    offset = text.indexOf(functionName, offset + functionName.length);
  }
  return -1;
}

function extractFirstStringLikeArgument(text: string, openParenIndex: number): string | null {
  let cursor = openParenIndex + 1;
  const scanLimit = Math.min(text.length, openParenIndex + 260);
  while (cursor < scanLimit) {
    const ch = text[cursor];
    if (ch === ')' || ch === '\n') {
      return null;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const end = text.indexOf(ch, cursor + 1);
      if (end > cursor + 1) {
        return text.slice(cursor + 1, end);
      }
      return null;
    }
    cursor += 1;
  }
  return null;
}

function normalizeStringLikeEndpoint(raw: string): string | null {
  if (raw.startsWith('/')) {
    return normalizeEndpoint(raw);
  }
  if (!raw.includes('/api/')) {
    return null;
  }
  const apiIndex = raw.indexOf('/api/');
  if (apiIndex === -1) {
    return null;
  }
  return normalizeEndpoint(raw.slice(apiIndex));
}

function isIgnorableLocalCall(calledFunc: string): boolean {
  const ignoredCalls = [
    'if',
    'for',
    'while',
    'return',
    'await',
    'catch',
    'try',
    'console',
    'Math',
    'JSON',
    'Array',
    'Object',
    'String',
    'Number',
    'Date',
    'Promise',
    'Error',
    'URLSearchParams',
    'AbortController',
    'setTimeout',
    'clearTimeout',
  ];
  if (ignoredCalls.includes(calledFunc)) {
    return true;
  }
  return (
    calledFunc.startsWith('set') &&
    calledFunc[3] !== undefined &&
    calledFunc[3] >= 'A' &&
    calledFunc[3] <= 'Z'
  );
}

function extractCalledFunctionNames(bodyText: string): string[] {
  const calls: string[] = [];
  let cursor = 0;
  while (cursor < bodyText.length) {
    if (!isIdentifierChar(bodyText[cursor]) || !isLowercaseLetter(bodyText[cursor])) {
      cursor += 1;
      continue;
    }
    const start = cursor;
    cursor += 1;
    while (isIdentifierChar(bodyText[cursor])) {
      cursor += 1;
    }
    const calledFunc = bodyText.slice(start, cursor);
    let afterName = cursor;
    while (isWhitespaceChar(bodyText[afterName])) {
      afterName += 1;
    }
    if (bodyText[afterName] === '(') {
      calls.push(calledFunc);
    }
  }
  return calls;
}

function isLowercaseLetter(value: string | undefined): boolean {
  return value !== undefined && value >= 'a' && value <= 'z';
}

function findApiCallInLocalFunction(
  fileContent: string,
  funcName: string,
  hookRegistry: HookRegistry,
  apiModuleMap: Map<string, { endpoint: string; method: string }>,
  visited: Set<string>,
  depth = 0,
): { endpoint: string; method: string } | null {
  if (depth > 4 || visited.has(funcName)) {
    return null;
  }
  visited.add(funcName);

  const bodyText = extractFunctionBody(fileContent, funcName);
  if (!bodyText) {
    return null;
  }

  const direct = extractDirectApiFromBody(bodyText);
  if (direct) {
    return { endpoint: direct.endpoint, method: direct.method };
  }

  for (const [, funcMap] of hookRegistry) {
    for (const [hookFuncName, hookFunc] of funcMap) {
      if (handlerCallsFunction(bodyText, hookFuncName)) {
        return {
          endpoint: hookFunc.endpoint,
          method: hookFunc.method,
        };
      }
    }
  }

  for (const [apiFuncName, { endpoint, method }] of apiModuleMap) {
    if (handlerCallsApiModule(bodyText, apiFuncName)) {
      return { endpoint, method };
    }
  }

  for (const calledFunc of extractCalledFunctionNames(bodyText)) {
    if (isIgnorableLocalCall(calledFunc)) {
      continue;
    }

    const nested = findApiCallInLocalFunction(
      fileContent,
      calledFunc,
      hookRegistry,
      apiModuleMap,
      visited,
      depth + 1,
    );
    if (nested) {
      return nested;
    }
  }

  return null;
}

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

/** Detect method from body. */
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
