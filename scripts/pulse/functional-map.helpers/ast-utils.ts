import { normalizeEndpoint } from '../../parsers/api-parser';
import type { HookRegistry } from '../../parsers/hook-registry';
import {
  deriveZeroValue,
  discoverAllObservedHttpMethods,
  discoverReservedJsKeywords,
} from '../../dynamic-reality-kernel/catalog-arithmetic';

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

export function handlerCallsFunction(handler: string, funcName: string): boolean {
  return handler.trim() === funcName || hasFunctionCall(handler, funcName);
}

export function handlerCallsApiModule(handler: string, callName: string): boolean {
  const [objectName, methodName] = callName.split('.');
  if (methodName) {
    return hasMemberCall(handler, objectName, methodName);
  }

  return handlerCallsFunction(handler, callName);
}

export function extractFunctionBody(
  fileContent: string,
  funcName: string,
  maxLines = fileContent.split('\n').length,
): string {
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

export function detectMethodFromBody(body: string): string {
  const observedMethods = discoverAllObservedHttpMethods();
  const methodPattern = observedMethods.map(escapeRegExp).join('|');
  const match = body.match(new RegExp(`method\\s*:\\s*['"\`](${methodPattern})['"\`]`, 'i'));
  if (match) {
    return match[1].toUpperCase();
  }
  for (const method of observedMethods) {
    if (new RegExp(`\\.${escapeRegExp(method.toLowerCase())}\\s*\\(`, 'i').test(body)) {
      return method.toUpperCase();
    }
  }
  return observedMethods[deriveZeroValue()] ?? '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function extractDirectApiFromBody(
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
        line: deriveZeroValue(),
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
  const scanLimit = text.length;
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
  if (discoverReservedJsKeywords().has(calledFunc) || calledFunc in globalThis) {
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

export function findApiCallInLocalFunction(
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
