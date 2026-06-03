import { normalizeEndpoint } from './parsers/api-parser';
import { unique } from './parity-utils';

export type ApiModuleMap = Map<string, { endpoint: string; method: string }>;

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

/**
 * Branchless whitespace check that does not allocate a regex per call.
 * Used to skip whitespace runs in source-text scans without hitting Codacy's
 * regex-dos heuristic on `/\s/.test(...)` inside a `while` loop.
 */
function isWhitespaceChar(c: string | undefined): boolean {
  if (!c) return false;
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
}

function hasIdentifierAt(text: string, offset: number, identifier: string): boolean {
  if (!text.startsWith(identifier, offset)) {
    return false;
  }
  return !isIdentifierChar(text[offset - 1]) && !isIdentifierChar(text[offset + identifier.length]);
}

function hasFunctionCall(text: string, functionName: string): boolean {
  let offset = text.indexOf(functionName);
  while (offset !== -1) {
    if (hasIdentifierAt(text, offset, functionName)) {
      let cursor = offset + functionName.length;
      while (cursor < text.length && isWhitespaceChar(text[cursor])) {
        cursor += 1;
      }
      if (text[cursor] === '(') {
        return true;
      }
    }
    offset = text.indexOf(functionName, offset + functionName.length);
  }
  return false;
}

function findFunctionCallOpenParen(text: string, functionName: string, fromOffset: number): number {
  let offset = text.indexOf(functionName, fromOffset);
  while (offset !== -1) {
    if (hasIdentifierAt(text, offset, functionName)) {
      let cursor = offset + functionName.length;
      while (cursor < text.length && isWhitespaceChar(text[cursor])) {
        cursor += 1;
      }
      if (text[cursor] === '<') {
        let genericDepth = 0;
        while (cursor < text.length) {
          if (text[cursor] === '<') {
            genericDepth += 1;
          } else if (text[cursor] === '>') {
            genericDepth -= 1;
            if (genericDepth === 0) {
              cursor += 1;
              break;
            }
          } else if (text[cursor] === '\n') {
            break;
          }
          cursor += 1;
        }
        while (cursor < text.length && isWhitespaceChar(text[cursor])) {
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
  const interpolationEnd = raw.indexOf('}');
  if (raw.includes('${') && interpolationEnd !== -1) {
    const suffix = raw.slice(interpolationEnd + 1);
    if (suffix.startsWith('/')) {
      return normalizeEndpoint(suffix);
    }
  }
  return null;
}

function collectEndpointArguments(text: string, functionName: string): string[] {
  const endpoints: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const openParenIndex = findFunctionCallOpenParen(text, functionName, cursor);
    if (openParenIndex === -1) {
      break;
    }
    const raw = extractFirstStringLikeArgument(text, openParenIndex);
    const endpoint = raw ? normalizeStringLikeEndpoint(raw) : null;
    if (endpoint) {
      endpoints.push(endpoint);
    }
    cursor = openParenIndex + 1;
  }
  return endpoints;
}

function hasMemberCall(text: string, objectName: string, methodName: string): boolean {
  let offset = text.indexOf(objectName);
  while (offset !== -1) {
    if (hasIdentifierAt(text, offset, objectName)) {
      let cursor = offset + objectName.length;
      while (cursor < text.length && isWhitespaceChar(text[cursor])) {
        cursor += 1;
      }
      if (text[cursor] === '.') {
        cursor += 1;
        while (cursor < text.length && isWhitespaceChar(text[cursor])) {
          cursor += 1;
        }
        if (hasIdentifierAt(text, cursor, methodName)) {
          cursor += methodName.length;
          while (cursor < text.length && isWhitespaceChar(text[cursor])) {
            cursor += 1;
          }
          if (text[cursor] === '(') {
            return true;
          }
        }
      }
    }
    offset = text.indexOf(objectName, offset + objectName.length);
  }
  return false;
}

function extractDirectApiEndpoints(text: string): string[] {
  return unique([
    ...collectEndpointArguments(text, 'apiFetch'),
    ...collectEndpointArguments(text, 'useSWR'),
    ...collectEndpointArguments(text, 'fetch'),
    ...collectEndpointArguments(text, 'apiUrl'),
  ]);
}

function extractMappedApiEndpoints(
  text: string,
  apiModuleMap: ApiModuleMap,
  apiImportsInFile: Set<string>,
): string[] {
  const endpoints: string[] = [];

  for (const [callName, { endpoint }] of apiModuleMap) {
    const [objectName, methodName] = callName.split('.');
    if (methodName) {
      if (
        (apiImportsInFile.size === 0 || apiImportsInFile.has(objectName)) &&
        hasMemberCall(text, objectName, methodName)
      ) {
        endpoints.push(endpoint);
      }
      continue;
    }

    if (apiImportsInFile.has(callName) && hasFunctionCall(text, callName)) {
      endpoints.push(endpoint);
    }
  }

  return endpoints;
}

export function extractApiCallEndpoints(
  text: string,
  apiModuleMap: ApiModuleMap,
  apiImportsInFile: Set<string>,
): string[] {
  return unique([
    ...extractDirectApiEndpoints(text),
    ...extractMappedApiEndpoints(text, apiModuleMap, apiImportsInFile),
  ]);
}

function extractFunctionBody(lines: string[], functionName: string, maxLines = 80): string | null {
  const defIdx = lines.findIndex((line) => lineDeclaresFunction(line, functionName));
  if (defIdx === -1) {
    return null;
  }

  let depth = 0;
  let bodyEnd = Math.min(defIdx + Math.floor(maxLines / 2), lines.length);
  let bodyStarted = false;
  for (let j = defIdx; j < Math.min(defIdx + maxLines, lines.length); j++) {
    for (const ch of lines[j]) {
      if (ch === '{') {
        depth++;
        bodyStarted = true;
      }
      if (ch === '}') {
        depth--;
      }
    }
    if (bodyStarted && depth === 0) {
      bodyEnd = j + 1;
      break;
    }
  }

  return lines.slice(defIdx, bodyEnd).join('\n');
}

function lineDeclaresFunction(line: string, functionName: string): boolean {
  const trimmed = line.trimStart();
  if (trimmed.startsWith(`function ${functionName}`)) {
    return true;
  }
  if (trimmed.startsWith(`async function ${functionName}`)) {
    return true;
  }
  return trimmed.startsWith(`const ${functionName}`) || trimmed.startsWith(`let ${functionName}`);
}

export function extractSaveHandlerApiCalls(
  fileContent: string,
  apiModuleMap: ApiModuleMap,
  apiImportsInFile: Set<string>,
): string[] {
  const lines = fileContent.split('\n');
  const endpoints: string[] = [];

  for (const line of lines) {
    const functionName = extractDeclaredFunctionName(line);
    if (!functionName) {
      continue;
    }
    const body = extractFunctionBody(lines, functionName);
    if (!body) {
      continue;
    }
    const bodyEndpoints = extractApiCallEndpoints(body, apiModuleMap, apiImportsInFile);
    if (bodyEndpoints.length > 0) {
      endpoints.push(...bodyEndpoints);
    }
  }

  return unique(endpoints);
}

function extractDeclaredFunctionName(line: string): string | null {
  const trimmed = line.trimStart();
  for (const prefix of ['async function ', 'function ', 'const ', 'let ']) {
    if (!trimmed.startsWith(prefix)) {
      continue;
    }
    let cursor = prefix.length;
    while (cursor < trimmed.length && isWhitespaceChar(trimmed[cursor])) {
      cursor += 1;
    }
    let end = cursor;
    while (end < trimmed.length && isIdentifierChar(trimmed[end])) {
      end += 1;
    }
    if (end > cursor) {
      return trimmed.slice(cursor, end);
    }
  }
  return null;
}
