import { normalizeEndpoint } from './parsers/api-parser';

export type ApiModuleMap = Map<string, { endpoint: string; method: string }>;

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      const callRe = new RegExp(
        `\\b${escapeRegExp(objectName)}\\s*\\.\\s*${escapeRegExp(methodName)}\\s*\\(`,
      );
      if ((apiImportsInFile.size === 0 || apiImportsInFile.has(objectName)) && callRe.test(text)) {
        endpoints.push(endpoint);
      }
      continue;
    }

    const callRe = new RegExp(`\\b${escapeRegExp(callName)}\\s*\\(`);
    if (apiImportsInFile.has(callName) && callRe.test(text)) {
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

function extractFunctionBody(
  lines: string[],
  fileContent: string,
  functionName: string,
  maxLines = 80,
): string | null {
  const funcDefRe = new RegExp(
    `(?:const|let|function|async function)\\s+${escapeRegExp(functionName)}\\s*(?:=|\\()`,
    'g',
  );
  const defMatch = funcDefRe.exec(fileContent);
  if (!defMatch) {
    return null;
  }

  const defIdx = fileContent.substring(0, defMatch.index).split('\n').length - 1;
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
    const body = extractFunctionBody(lines, fileContent, match[1]);
    if (body) {
      endpoints.push(...extractApiCallEndpoints(body, apiModuleMap, apiImportsInFile));
    }
  }

  return unique(endpoints);
}
