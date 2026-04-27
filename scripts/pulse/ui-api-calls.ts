import { normalizeEndpoint } from './parsers/api-parser';
import { unique } from './parity-utils';

export type ApiModuleMap = Map<string, { endpoint: string; method: string }>;

function isIdentifierChar(value: string | undefined): boolean {
  return Boolean(value && /[\w$]/.test(value));
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
  const endpoints: string[] = [];
  const patterns = [
    /apiFetch\s*(?:<[^\n]*>)?\s*\(\s*(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/g,
    /useSWR\s*(?:<[^>]*>)?\s*\(\s*(?:[\w]+\s*\?\s*)?(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/g,
    /fetch\s*\(\s*(?:['"`](\/api\/[^'"`]+)['"`]|`\$\{(?:API_BASE|API_URL|apiBase|getServerApiBase\(\))\}([^`]*)`)/g,
    /fetch\s*\(\s*apiUrl\s*\(\s*(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const raw = match[1] || match[2];
      if (raw && raw.startsWith('/')) {
        endpoints.push(normalizeEndpoint(raw));
      }
    }
  }

  return endpoints;
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
  const saveHandlerRe =
    /(?:const|let|function|async function)\s+((?:handle|on|do|confirm)?(?:Save|Submit|Create|Update|Delete)\w*)\s*(?:=|\()/g;
  const endpoints: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = saveHandlerRe.exec(fileContent)) !== null) {
    const body = extractFunctionBody(lines, match[1]);
    if (body) {
      endpoints.push(...extractApiCallEndpoints(body, apiModuleMap, apiImportsInFile));
    }
  }

  return unique(endpoints);
}
