import { safeJoin } from '../safe-path';
import * as path from 'path';
import type { APICall, ProxyRoute, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { pathExists, readTextFile } from '../safe-fs';
import { getFrontendSourceDirs } from '../frontend-roots';
import { normalizeEndpoint } from './api-parser-normalize';
import { detectMethod } from './api-parser-string-utils';
import {
  extractMethodBlock,
  extractWrappedFetchCall,
  startsWrappedFetchCall,
  extractWrappedCallContext,
  extractNamedCallContext,
  extractMappedApiModuleCalls,
  buildFetchWrapperPrefixMap,
  findWrapperTemplatePrefix,
} from './api-parser-helpers';

export { normalizeEndpoint } from './api-parser-normalize';

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
            const wrapperMatch = block.match(
              /(\w+Mutation|\w+Fetch)\s*\(\s*(?:['"`]([^'"`]*)['"`]|`([^`]*)`)/,
            );
            if (wrapperMatch) {
              const wrapperName = wrapperMatch[1];
              const rawEp = wrapperMatch[2] || wrapperMatch[3];
              if (rawEp) {
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
          if (/^\/api:[a-z]/i.test(endpoint) || endpoint === '/api' || endpoint.length < 3) {
            continue;
          }
          const key = `${relFile}:${i + 1}:${endpoint}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);

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

        // Pattern 4a: useSWR with buildUrl helper
        const buildUrlMatch = line.match(
          /useSWR\s*(?:<[^>]*>)?\s*\(\s*buildUrl\s*\(\s*['"`]([^'"`]+)['"`]/,
        );
        if (buildUrlMatch) {
          const returnMatch = content.match(/function\s+buildUrl[\s\S]*?return\s+`\/([^$`]+)\$\{/);
          if (returnMatch) {
            const basePath = '/' + returnMatch[1];
            const fullEndpoint = basePath + buildUrlMatch[1];
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

        // Pattern 4b: Multiline apiFetch
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
                  let stmtCtx = '';
                  let pd = 0;
                  let st = false;
                  const si = line.indexOf('apiFetch');
                  for (let ci = si; ci < line.length; ci++) {
                    const ch = line[ci];
                    stmtCtx += ch;
                    if (ch === '(') {
                      pd++;
                      st = true;
                    }
                    if (ch === ')') {
                      pd--;
                      if (st && pd === 0) {
                        break;
                      }
                    }
                  }
                  if (st && pd > 0) {
                    for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
                      for (const ch of lines[j]) {
                        stmtCtx += ch;
                        if (ch === '(') {
                          pd++;
                        }
                        if (ch === ')') {
                          pd--;
                          if (pd === 0) {
                            break;
                          }
                        }
                      }
                      if (pd === 0) {
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
                    method: detectMethod(stmtCtx),
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

      const appIdx = file.indexOf('/app/api/');
      if (appIdx === -1) {
        continue;
      }
      const routePart = file.substring(appIdx + 4).replace(/\/route\.ts$/, '');
      const frontendPath = routePart.replace(/\/\[\.\.\.?\w+\]/, '/:path');

      const handlerRe = /export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\s*\(/g;
      let match;
      while ((match = handlerRe.exec(content)) !== null) {
        const method = match[1];
        let backendPath = frontendPath.replace(/^\/api\//, '/');

        const templateFetchMatch = content.match(/fetch\s*\(\s*`\$\{[^}]+\}(\/[^`]+)`/);
        if (templateFetchMatch) {
          backendPath = templateFetchMatch[1];
        }

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
