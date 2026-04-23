import { safeJoin, safeResolve } from '../safe-path';
import * as path from 'path';
import type { APICall, ProxyRoute, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { pathExists, readTextFile } from '../safe-fs';
import { getFrontendSourceDirs } from '../frontend-roots';

/** Normalize endpoint. */
export function normalizeEndpoint(raw: string): string {
  let p = raw;

  // Strip query string builders with nested braces: ${buildQuery({ workspaceId })}
  // These use nested {} so we can't just match [^}]* — strip from ${ to end if it's buildQuery/qs/query
  // Use [\s\S]* instead of .* to handle multiline template literals
  p = p.replace(/\$\{buildQuery\b[\s\S]*$/g, '');
  p = p.replace(/\$\{(?:qs|query|q|search|queryString|params)\b[^}]*\}?/gi, '');
  // Also handle incomplete template literals where backtick was split: /sales${q
  p = p.replace(/\$\{\w+$/g, '');

  // Replace ${encodeURIComponent(varName)} with :varName
  p = p.replace(/\$\{encodeURIComponent\((\w+)\)\}/g, ':$1');

  // Replace remaining ${varName} with :varName (path params)
  p = p.replace(/\$\{(\w+)\}/g, ':$1');

  // Replace complex expressions ${...} with :param
  p = p.replace(/\$\{[^}]+\}/g, ':param');

  // Strip query string (anything after ?)
  p = p.split('?')[0];

  // Clean trailing junk from template literal artifacts: ), }, etc.
  p = p.replace(/[\)\}\]]+$/, '');

  // Clean up trailing/double slashes
  p = p.replace(/\/+$/, '');
  if (!p.startsWith('/')) {
    p = '/' + p;
  }
  return p.replace(/\/+/g, '/');
}

function detectMethod(context: string): string {
  const m = context.match(/method\s*:\s*['"`](GET|POST|PUT|PATCH|DELETE)['"`]/i);
  if (m) {
    return m[1].toUpperCase();
  }
  if (/\.post\s*\(/i.test(context)) {
    return 'POST';
  }
  if (/\.put\s*\(/i.test(context)) {
    return 'PUT';
  }
  if (/\.patch\s*\(/i.test(context)) {
    return 'PATCH';
  }
  if (/\.delete\s*\(/i.test(context)) {
    return 'DELETE';
  }
  return 'GET';
}

function extractMethodBlock(lines: string[], startIndex: number, maxLines = 80): string {
  const block: string[] = [];
  let depth = 0;
  let parenDepth = 0;
  let started = false;
  let expressionMode = false;

  for (let i = startIndex; i < Math.min(startIndex + maxLines, lines.length); i++) {
    const line = lines[i];
    block.push(line);

    let scanFrom = 0;
    if (!started) {
      const bodyStart = findMethodBodyStart(line);
      if (bodyStart < 0) {
        if (/=>/.test(line)) {
          expressionMode = true;
          started = true;
          scanFrom = Math.max(0, line.indexOf('=>') + 2);
        } else {
          continue;
        }
      } else {
        scanFrom = bodyStart;
      }
    }

    if (expressionMode) {
      for (const ch of line.slice(scanFrom)) {
        if (ch === '(' || ch === '[') {
          parenDepth++;
        } else if (ch === ')' || ch === ']') {
          parenDepth--;
        }
      }
      if (started && parenDepth <= 0 && /,\s*$/.test(line.trim())) {
        break;
      }
      continue;
    }

    for (const ch of line.slice(scanFrom)) {
      if (ch === '{') {
        depth++;
        started = true;
      } else if (ch === '}') {
        depth--;
      }
    }

    if (started && depth <= 0) {
      break;
    }
  }

  return block.join('\n');
}

function findMethodBodyStart(line: string): number {
  const bodyStart = line.lastIndexOf('{');
  if (bodyStart < 0) {
    return -1;
  }

  const beforeBody = line.slice(0, bodyStart).trim();
  if (/=>\s*$/.test(beforeBody) || /\)\s*(?::[^=]*)?$/.test(beforeBody)) {
    return bodyStart;
  }

  return -1;
}

function parseUrlPath(value: string): string {
  try {
    if (/^https?:\/\//i.test(value)) {
      return new URL(value).pathname.replace(/\/$/, '');
    }
  } catch {
    return '';
  }
  return value.startsWith('/') ? value.replace(/\/$/, '') : '';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFetchWrapperPrefixMap(files: string[]): Map<string, string> {
  const wrapperPrefixes = new Map<string, string>([['apiFetch', '']]);

  for (const file of files) {
    const content = readTextFile(file, 'utf8');
    const exportedWrapperMatches = [
      ...content.matchAll(/export\s+async\s+function\s+(\w*Fetch)\b/g),
    ];
    if (exportedWrapperMatches.length === 0) {
      continue;
    }

    const apiUrlMatch = content.match(
      /(?:const|let)\s+\w*API\w*URL\w*\s*=\s*[\s\S]*?['"`](https?:\/\/[^'"`]+|\/[^'"`]+)['"`]/,
    );
    const prefix = apiUrlMatch ? parseUrlPath(apiUrlMatch[1]) : '';

    for (const match of exportedWrapperMatches) {
      const wrapperName = match[1];
      wrapperPrefixes.set(wrapperName, wrapperName === 'apiFetch' ? '' : prefix);
    }
  }

  return wrapperPrefixes;
}

function extractWrappedFetchCall(
  text: string,
  wrapperPrefixes: Map<string, string>,
): { endpoint: string; wrapperName: string } | null {
  const callRe = /\b(\w+)\s*(?:<[^\n]*>)?\s*\(\s*(?:['"`]([^'"`]*)['"`]|`([^`]*)`)/g;
  const directMatches = [...text.matchAll(callRe)];
  const directMatch = directMatches.find((match) => wrapperPrefixes.has(match[1])) || null;
  if (directMatch) {
    const wrapperName = directMatch[1];
    const raw = directMatch[2] || directMatch[3] || '';
    const prefix = wrapperPrefixes.get(wrapperName) || '';
    return { endpoint: normalizeEndpoint(`${prefix}${raw}`), wrapperName };
  }

  const conditionalRe =
    /^\b(\w+)\s*(?:<[^\n]*>)?\s*\(\s*[\s\S]*?\?\s*(?:['"`]([^'"`]*)['"`]|`([^`]*)`)\s*:\s*(?:['"`]([^'"`]*)['"`]|`([^`]*)`)/;
  let conditionalMatch: RegExpMatchArray | null = null;
  for (const wrapperName of wrapperPrefixes.keys()) {
    const wrapperStartRe = new RegExp(
      `\\b${escapeRegExp(wrapperName)}\\s*(?:<[^\\n]*>)?\\s*\\(`,
      'g',
    );
    for (const startMatch of text.matchAll(wrapperStartRe)) {
      const startIndex = startMatch.index || 0;
      const match = text.slice(startIndex).match(conditionalRe);
      if (match) {
        conditionalMatch = match;
        break;
      }
    }
    if (conditionalMatch) {
      break;
    }
  }
  if (conditionalMatch && wrapperPrefixes.has(conditionalMatch[1])) {
    const wrapperName = conditionalMatch[1];
    const raw =
      conditionalMatch[2] ||
      conditionalMatch[3] ||
      conditionalMatch[4] ||
      conditionalMatch[5] ||
      '';
    const prefix = wrapperPrefixes.get(wrapperName) || '';
    return { endpoint: normalizeEndpoint(`${prefix}${raw}`), wrapperName };
  }

  for (const wrapperName of wrapperPrefixes.keys()) {
    const variableCallRe = new RegExp(
      `\\b${escapeRegExp(wrapperName)}\\s*(?:<[^\\n]*>)?\\s*\\(\\s*(\\w+)\\b`,
      'g',
    );
    let variableCallMatch: RegExpExecArray | null;
    while ((variableCallMatch = variableCallRe.exec(text)) !== null) {
      const raw = extractEndpointVariable(text, variableCallMatch[1]);
      if (!raw) {
        continue;
      }
      const prefix = wrapperPrefixes.get(wrapperName) || '';
      return { endpoint: normalizeEndpoint(`${prefix}${raw}`), wrapperName };
    }
  }

  return null;
}

function extractEndpointVariable(text: string, variableName: string): string | null {
  const declarationRe = new RegExp(
    `\\b(?:const|let|var)\\s+${escapeRegExp(variableName)}\\s*=\\s*`,
    'g',
  );
  const declaration = declarationRe.exec(text);
  if (!declaration) {
    return null;
  }

  let index = declaration.index + declaration[0].length;
  while (/\s/.test(text[index] || '')) {
    index++;
  }

  const quote = text[index];
  if (quote !== '`' && quote !== '"' && quote !== "'") {
    return null;
  }

  if (quote !== '`') {
    const end = findQuotedStringEnd(text, index + 1, quote);
    const raw = end > index ? text.slice(index + 1, end) : '';
    return raw.startsWith('/') ? raw : null;
  }

  const raw = readTemplateEndpoint(text, index + 1);
  return raw.startsWith('/') ? raw : null;
}

function findQuotedStringEnd(text: string, start: number, quote: string): number {
  for (let i = start; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (text[i] === quote) {
      return i;
    }
  }
  return -1;
}

function readTemplateEndpoint(text: string, start: number): string {
  let raw = '';
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (ch === '`') {
      break;
    }
    if (ch !== '$' || text[i + 1] !== '{') {
      raw += ch;
      continue;
    }

    const expressionEnd = findTemplateExpressionEnd(text, i + 2);
    if (expressionEnd < 0) {
      break;
    }
    const expression = text.slice(i + 2, expressionEnd);
    if (isQueryTemplateExpression(expression)) {
      break;
    }
    raw += '${' + expression + '}';
    i = expressionEnd;
  }
  return raw;
}

function findTemplateExpressionEnd(text: string, start: number): number {
  let depth = 1;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

function isQueryTemplateExpression(expression: string): boolean {
  return /\?|URLSearchParams|query|queryString|search|params|toString\(\)|buildQuery|qs\b/i.test(
    expression,
  );
}

function startsWrappedFetchCall(line: string, wrapperPrefixes: Map<string, string>): boolean {
  const match = line.match(/\b(\w+)\s*(?:<[^\n]*>)?\s*\(/);
  return Boolean(match && wrapperPrefixes.has(match[1]));
}

function extractWrappedCallContext(
  lines: string[],
  startIndex: number,
  wrapperPrefixes: Map<string, string>,
): string {
  const firstLine = lines[startIndex] || '';
  let matchStart = -1;
  for (const wrapperName of wrapperPrefixes.keys()) {
    const match = firstLine.match(
      new RegExp(`\\b${escapeRegExp(wrapperName)}\\s*(?:<[^\\n]*>)?\\s*\\(`),
    );
    if (match?.index !== undefined && (matchStart < 0 || match.index < matchStart)) {
      matchStart = match.index;
    }
  }
  if (matchStart < 0) {
    return lines.slice(startIndex, Math.min(startIndex + 8, lines.length)).join('\n');
  }

  let context = '';
  let parenDepth = 0;
  let started = false;
  for (let i = startIndex; i < Math.min(startIndex + 8, lines.length); i++) {
    const line = lines[i] || '';
    const scanFrom = i === startIndex ? matchStart : 0;
    for (const ch of line.slice(scanFrom)) {
      context += ch;
      if (ch === '(') {
        parenDepth++;
        started = true;
      } else if (ch === ')') {
        parenDepth--;
        if (started && parenDepth <= 0) {
          return context;
        }
      }
    }
    context += '\n';
  }

  return context;
}

function extractNamedCallContext(lines: string[], startIndex: number, callName: string): string {
  const startLine = lines[startIndex] || '';
  const matchStart = startLine.indexOf(callName);
  if (matchStart < 0) {
    return '';
  }

  let context = '';
  let parenDepth = 0;
  let started = false;
  for (let i = startIndex; i < Math.min(startIndex + 30, lines.length); i++) {
    const line = lines[i] || '';
    const scanFrom = i === startIndex ? matchStart : 0;
    for (const ch of line.slice(scanFrom)) {
      context += ch;
      if (ch === '(') {
        parenDepth++;
        started = true;
      } else if (ch === ')') {
        parenDepth--;
        if (started && parenDepth <= 0) {
          return context;
        }
      }
    }
    context += '\n';
  }

  return context;
}

function extractMappedApiModuleCalls(
  text: string,
  apiModuleMap: Map<string, { endpoint: string; method: string }>,
): Array<{ endpoint: string; method: string }> {
  const matches: Array<{ endpoint: string; method: string }> = [];
  for (const [callName, apiInfo] of apiModuleMap) {
    const [objectName, methodName] = callName.split('.');
    const callRe = methodName
      ? new RegExp(`\\b${escapeRegExp(objectName)}\\s*\\.\\s*${escapeRegExp(methodName)}\\s*\\(`)
      : new RegExp(`\\b${escapeRegExp(callName)}\\s*\\(`);
    if (callRe.test(text)) {
      matches.push(apiInfo);
    }
  }
  return matches;
}

function findWrapperTemplatePrefix(content: string, wrapperName: string): string {
  const start = content.indexOf(`function ${wrapperName}`);
  if (start < 0) {
    return '';
  }
  const bodyWindow = content.slice(start, start + 1500);
  const wrapperDef = bodyWindow.match(/apiFetch[^(]*\(\s*`([^$`]*?)\$\{/);
  return wrapperDef ? wrapperDef[1] : '';
}

// Pass 1: Parse API module files to build function-to-endpoint map
export function buildApiModuleMap(
  config: PulseConfig,
): Map<string, { endpoint: string; method: string }> {
  const map = new Map<string, { endpoint: string; method: string }>();
  const apiDirs = getFrontendSourceDirs(config)
    .map((frontendDir) => safeJoin(frontendDir, 'lib', 'api'))
    .filter((apiDir) => pathExists(apiDir));

  const files = apiDirs.flatMap((apiDir) => walkFiles(apiDir, ['.ts']));
  const wrapperPrefixes = buildFetchWrapperPrefixMap(files);
  for (const file of files) {
    const content = readTextFile(file, 'utf8');
    const lines = content.split('\n');
    const basename = path.basename(file, '.ts');

    // Track current API object — updated as we scan through the file
    let objectName: string | undefined;

    // Find function declarations that call apiFetch
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Detect exported API objects: export const productApi = { ... }
      const objDecl = line.match(/export\s+const\s+(\w+Api|\w+api)\s*=\s*\{/i);
      if (objDecl) {
        objectName = objDecl[1];
      }

      // Named export functions: export async function listCampaigns(...)
      const funcMatch = line.match(/export\s+(?:async\s+)?function\s+(\w+)/);
      if (funcMatch) {
        const block = extractMethodBlock(lines, i, 120);
        const apiMatch = extractWrappedFetchCall(block, wrapperPrefixes);
        if (apiMatch) {
          const ep = apiMatch.endpoint;
          const method = detectMethod(block);
          map.set(funcMatch[1], { endpoint: ep, method });
        }
      }

      // Object method: list: (params) => apiFetch(...)  or  list: async () => apiFetch(...)
      if (objectName) {
        const methodMatch =
          line.match(/^\s{2}(\w+)\s*[:=]\s*(?:async\s+)?\(?/) ||
          line.match(/^\s{2}(?:async\s+)?(\w+)\s*\([^)]*\)\s*(?::[^{]+)?\{/) ||
          line.match(/^\s{2}(?:async\s+)?(\w+)\s*\(/);
        if (methodMatch) {
          if (['if', 'for', 'while', 'switch', 'catch', 'return'].includes(methodMatch[1])) {
            continue;
          }
          const block = extractMethodBlock(lines, i);
          const apiMatch = extractWrappedFetchCall(block, wrapperPrefixes);
          if (apiMatch) {
            const ep = apiMatch.endpoint;
            const method = detectMethod(block);
            map.set(`${objectName}.${methodMatch[1]}`, { endpoint: ep, method });
          } else {
            // Detect custom wrapper functions that call apiFetch internally
            // e.g. kycMutation('/kyc/submit') where kycMutation calls apiFetch(`/api${endpoint}`)
            const wrapperMatch = block.match(
              /(\w+Mutation|\w+Fetch)\s*\(\s*(?:['"`]([^'"`]*)['"`]|`([^`]*)`)/,
            );
            if (wrapperMatch) {
              const wrapperName = wrapperMatch[1];
              const rawEp = wrapperMatch[2] || wrapperMatch[3];
              if (rawEp) {
                // Find the wrapper function to determine its prefix
                const prefix = findWrapperTemplatePrefix(content, wrapperName);
                const ep = normalizeEndpoint(prefix + rawEp);
                const method = detectMethod(block);
                map.set(`${objectName}.${methodMatch[1]}`, { endpoint: ep, method });
              }
            }
          }
        }
      }
    }
  }

  return map;
}

// Pass 2: Scan all frontend files for API calls
export function parseAPICalls(config: PulseConfig): APICall[] {
  const calls: APICall[] = [];
  const seen = new Set<string>(); // dedup: file:line:endpoint
  const files = getFrontendSourceDirs(config).flatMap((frontendDir) =>
    walkFiles(frontendDir, ['.ts', '.tsx']),
  );
  const wrapperPrefixes = buildFetchWrapperPrefixMap(files);
  const apiModuleMap = buildApiModuleMap(config);

  for (const file of files) {
    // Skip test files and type-only files
    if (/\.(test|spec|d)\.ts/.test(file)) {
      continue;
    }

    try {
      const content = readTextFile(file, 'utf8');
      const lines = content.split('\n');
      const relFile = path.relative(config.rootDir, file);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const context = lines.slice(i, Math.min(i + 8, lines.length)).join('\n');

        // Pattern 1: apiFetch('/endpoint', ...)
        const apiFetchMatches = [
          ...line.matchAll(/apiFetch\s*(?:<[^(]*>)?\s*\(\s*['"`]([^'"`]+)['"`]/g),
          ...line.matchAll(/apiFetch\s*(?:<[^(]*>)?\s*\(\s*`([^`]+)`/g),
        ];
        for (const m of apiFetchMatches) {
          const raw = m[1];
          const endpoint = normalizeEndpoint(raw);
          // Skip malformed endpoints from wrapper functions (e.g., /api${endpoint} → /api:endpoint)
          if (/^\/api:[a-z]/i.test(endpoint) || endpoint === '/api' || endpoint.length < 3) {
            continue;
          }

          const key = `${relFile}:${i + 1}:${endpoint}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);

          // For method detection: extract ONLY the apiFetch() call context.
          // Start from the match position and use brace-counting to find the end of the call.
          const matchStart = m.index || 0;
          let stmtContext = '';
          let parenDepth = 0;
          let started = false;
          for (let ci = matchStart; ci < line.length; ci++) {
            const ch = line[ci];
            stmtContext += ch;
            if (ch === '(') {
              parenDepth++;
              started = true;
            }
            if (ch === ')') {
              parenDepth--;
              if (started && parenDepth === 0) {
                break;
              }
            }
          }
          // If parens not balanced on this line, expand to next lines
          if (started && parenDepth > 0) {
            for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
              for (const ch of lines[j]) {
                stmtContext += ch;
                if (ch === '(') {
                  parenDepth++;
                }
                if (ch === ')') {
                  parenDepth--;
                  if (parenDepth === 0) {
                    break;
                  }
                }
              }
              if (parenDepth === 0) {
                break;
              }
            }
          }

          const isProxy = endpoint.startsWith('/api/');
          calls.push({
            file: relFile,
            line: i + 1,
            endpoint: raw,
            normalizedPath: endpoint,
            method: detectMethod(stmtContext),
            callPattern: 'apiFetch',
            isProxy,
            proxyTarget: isProxy ? endpoint.replace(/^\/api\//, '/') : null,
            callerFunction: null,
          });
        }

        const wrappedContext = startsWrappedFetchCall(line, wrapperPrefixes)
          ? extractWrappedCallContext(lines, i, wrapperPrefixes)
          : '';
        const wrappedCall = wrappedContext
          ? extractWrappedFetchCall(wrappedContext, wrapperPrefixes)
          : null;
        if (wrappedCall && wrappedCall.wrapperName !== 'apiFetch') {
          const endpoint = wrappedCall.endpoint;
          const key = `${relFile}:${i + 1}:${endpoint}`;
          if (!seen.has(key)) {
            seen.add(key);
            const isProxy = endpoint.startsWith('/api/');
            calls.push({
              file: relFile,
              line: i + 1,
              endpoint,
              normalizedPath: endpoint,
              method: detectMethod(wrappedContext),
              callPattern: 'objectApi',
              isProxy,
              proxyTarget: isProxy ? endpoint.replace(/^\/api\//, '/') : null,
              callerFunction: null,
            });
          }
        }

        // Pattern 2: useSWR('/endpoint', swrFetcher)
        // Support nested generics like useSWR<Record<string, Foo>>('/endpoint', ...)
        const swrMatch = line.match(
          /useSWR\s*(?:<[^(]*>)?\s*\(\s*(?:[\w]+\s*\?\s*)?(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/,
        );
        if (swrMatch) {
          const raw = swrMatch[1] || swrMatch[2];
          if (raw && raw.startsWith('/')) {
            const endpoint = normalizeEndpoint(raw);
            const key = `${relFile}:${i + 1}:${endpoint}`;
            if (!seen.has(key)) {
              seen.add(key);
              const isProxy = endpoint.startsWith('/api/');
              calls.push({
                file: relFile,
                line: i + 1,
                endpoint: raw,
                normalizedPath: endpoint,
                method: 'GET',
                callPattern: 'useSWR',
                isProxy,
                proxyTarget: isProxy ? endpoint.replace(/^\/api\//, '/') : null,
                callerFunction: null,
              });
            }
          }
        }

        if (/useSWR\s*(?:<[^>]*>)?\s*\(/.test(line)) {
          const swrContext = extractNamedCallContext(lines, i, 'useSWR');
          for (const mapped of extractMappedApiModuleCalls(swrContext, apiModuleMap)) {
            const endpoint = normalizeEndpoint(mapped.endpoint);
            const key = `${relFile}:${i + 1}:${endpoint}`;
            if (seen.has(key)) {
              continue;
            }
            seen.add(key);
            const isProxy = endpoint.startsWith('/api/');
            calls.push({
              file: relFile,
              line: i + 1,
              endpoint,
              normalizedPath: endpoint,
              method: mapped.method,
              callPattern: 'useSWR',
              isProxy,
              proxyTarget: isProxy ? endpoint.replace(/^\/api\//, '/') : null,
              callerFunction: null,
            });
          }
        }

        // Pattern 3: fetch(`${API_BASE}/endpoint`) or fetch('/api/...')
        const fetchMatches = [
          ...line.matchAll(
            /fetch\s*\(\s*`\$\{(?:API_BASE|API_URL|apiBase|getServerApiBase\(\))\}([^`]*)`/g,
          ),
          ...line.matchAll(/fetch\s*\(\s*['"`](\/api\/[^'"`]+)['"`]/g),
          ...line.matchAll(/fetch\s*\(\s*apiUrl\s*\(\s*(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/g),
        ];
        for (const m of fetchMatches) {
          const raw = m[1] || m[2];
          if (!raw || raw.length < 2) {
            continue;
          }
          const endpoint = normalizeEndpoint(raw);
          const key = `${relFile}:${i + 1}:${endpoint}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);

          const isProxy = endpoint.startsWith('/api/');
          calls.push({
            file: relFile,
            line: i + 1,
            endpoint: raw,
            normalizedPath: endpoint,
            method: detectMethod(context),
            callPattern: 'fetch',
            isProxy,
            proxyTarget: isProxy ? endpoint.replace(/^\/api\//, '/') : null,
            callerFunction: null,
          });
        }

        // Pattern 4a: useSWR with buildUrl helper — useSWR(buildUrl('vendas', f), ...)
        // Detects patterns like: function buildUrl(endpoint) { return `/reports/${endpoint}...`; }
        // then: useSWR(buildUrl('vendas'), ...)
        const buildUrlMatch = line.match(
          /useSWR\s*(?:<[^>]*>)?\s*\(\s*buildUrl\s*\(\s*['"`]([^'"`]+)['"`]/,
        );
        if (buildUrlMatch) {
          // Find the base path from the return statement near buildUrl: return `/reports/${endpoint}...`
          const returnMatch = content.match(/function\s+buildUrl[\s\S]*?return\s+`\/([^$`]+)\$\{/);
          if (returnMatch) {
            const basePath = '/' + returnMatch[1];
            const endpointSuffix = buildUrlMatch[1];
            const fullEndpoint = basePath + endpointSuffix;
            const normalizedEp = normalizeEndpoint(fullEndpoint);
            const key = `${relFile}:${i + 1}:${normalizedEp}`;
            if (!seen.has(key)) {
              seen.add(key);
              calls.push({
                file: relFile,
                line: i + 1,
                endpoint: fullEndpoint,
                normalizedPath: normalizedEp,
                method: 'GET',
                callPattern: 'useSWR',
                isProxy: false,
                proxyTarget: null,
                callerFunction: null,
              });
            }
          }
        }

        // Pattern 4b: Multiline apiFetch/useSWR — call on this line, endpoint on next line(s)
        if (apiFetchMatches.length === 0 && /apiFetch\s*(?:<[^(]*>)?\s*\(\s*$/.test(line)) {
          const block = lines.slice(i, Math.min(i + 6, lines.length)).join('\n');
          const multiMatch = block.match(
            /apiFetch\s*(?:<[^>]*>)?\s*\(\s*\n\s*(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/,
          );
          if (multiMatch) {
            const raw = multiMatch[1] || multiMatch[2];
            if (raw) {
              const endpoint = normalizeEndpoint(raw);
              if (!/^\/api:[a-z]/i.test(endpoint) && endpoint !== '/api' && endpoint.length >= 3) {
                const key = `${relFile}:${i + 1}:${endpoint}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  // Use brace-counting to extract just this apiFetch call for method detection
                  let stmtContext = '';
                  let parenDepth = 0;
                  let started = false;
                  const startIdx = line.indexOf('apiFetch');
                  for (let ci = startIdx; ci < line.length; ci++) {
                    const ch = line[ci];
                    stmtContext += ch;
                    if (ch === '(') {
                      parenDepth++;
                      started = true;
                    }
                    if (ch === ')') {
                      parenDepth--;
                      if (started && parenDepth === 0) {
                        break;
                      }
                    }
                  }
                  if (started && parenDepth > 0) {
                    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
                      for (const ch of lines[j]) {
                        stmtContext += ch;
                        if (ch === '(') {
                          parenDepth++;
                        }
                        if (ch === ')') {
                          parenDepth--;
                          if (parenDepth === 0) {
                            break;
                          }
                        }
                      }
                      if (parenDepth === 0) {
                        break;
                      }
                    }
                  }
                  const isProxy = endpoint.startsWith('/api/');
                  calls.push({
                    file: relFile,
                    line: i + 1,
                    endpoint: raw,
                    normalizedPath: endpoint,
                    method: detectMethod(stmtContext),
                    callPattern: 'apiFetch',
                    isProxy,
                    proxyTarget: isProxy ? endpoint.replace(/^\/api\//, '/') : null,
                    callerFunction: null,
                  });
                }
              }
            }
          }
        }

        if (!swrMatch && /useSWR\s*(?:<[^>]*>)?\s*\(\s*$/.test(line)) {
          const block = lines.slice(i, Math.min(i + 4, lines.length)).join('\n');
          const multiMatch = block.match(
            /useSWR\s*(?:<[^>]*>)?\s*\(\s*\n\s*(?:[\w]+\s*\?\s*)?(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/,
          );
          if (multiMatch) {
            const raw = multiMatch[1] || multiMatch[2];
            if (raw && raw.startsWith('/')) {
              const endpoint = normalizeEndpoint(raw);
              const key = `${relFile}:${i + 1}:${endpoint}`;
              if (!seen.has(key)) {
                seen.add(key);
                const isProxy = endpoint.startsWith('/api/');
                calls.push({
                  file: relFile,
                  line: i + 1,
                  endpoint: raw,
                  normalizedPath: endpoint,
                  method: 'GET',
                  callPattern: 'useSWR',
                  isProxy,
                  proxyTarget: isProxy ? endpoint.replace(/^\/api\//, '/') : null,
                  callerFunction: null,
                });
              }
            }
          }
        }
      }
    } catch (e) {
      process.stderr.write(
        `  [warn] Could not parse API calls in ${file}: ${(e as Error).message}\n`,
      );
    }
  }

  return calls;
}

// Parse Next.js proxy routes
export function parseProxyRoutes(config: PulseConfig): ProxyRoute[] {
  const routes: ProxyRoute[] = [];
  const apiDirs = getFrontendSourceDirs(config)
    .map((frontendDir) => safeJoin(frontendDir, 'app', 'api'))
    .filter((apiDir) => pathExists(apiDir));

  const routeFiles = apiDirs
    .flatMap((apiDir) => walkFiles(apiDir, ['.ts']))
    .filter((f) => f.endsWith('route.ts'));

  for (const file of routeFiles) {
    try {
      const content = readTextFile(file, 'utf8');
      const relFile = path.relative(config.rootDir, file);

      // Derive frontend path from file system path
      // frontend/src/app/api/whatsapp-api/session/status/route.ts -> /api/whatsapp-api/session/status
      const appIdx = file.indexOf('/app/api/');
      if (appIdx === -1) {
        continue;
      }
      const routePart = file.substring(appIdx + 4).replace(/\/route\.ts$/, '');
      const frontendPath = routePart.replace(/\/\[\.\.\.?\w+\]/, '/:path'); // catch-all

      // Find exported HTTP handlers
      const handlerRe = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g;
      let match;
      while ((match = handlerRe.exec(content)) !== null) {
        const method = match[1];

        // Try to find upstream backend path
        let backendPath = frontendPath.replace(/^\/api\//, '/');

        // Look for explicit proxy target in fetch calls
        // Pattern 1: fetch(`${backendUrl}/auth/oauth/google`, ...)
        const templateFetchMatch = content.match(/fetch\s*\(\s*`\$\{[^}]+\}(\/[^`]+)`/);
        if (templateFetchMatch) {
          backendPath = templateFetchMatch[1];
        }

        // Pattern 2: fetch('/some/path', ...) or proxy('/some/path')
        if (backendPath === frontendPath.replace(/^\/api\//, '/')) {
          const proxyMatch = content.match(/['"`](\/[^'"`]+)['"`]\s*(?:,|\))/);
          if (proxyMatch) {
            const candidate = proxyMatch[1];
            if (!candidate.startsWith('/api/') && candidate.includes('/')) {
              backendPath = candidate;
            }
          }
        }

        routes.push({
          file: relFile,
          line: 1,
          frontendPath,
          httpMethod: method,
          backendPath,
        });
      }
    } catch (e) {
      process.stderr.write(
        `  [warn] Could not parse proxy route ${file}: ${(e as Error).message}\n`,
      );
    }
  }

  return routes;
}
