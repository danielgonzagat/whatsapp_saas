import * as fs from 'fs';
import * as path from 'path';
import type { APICall, ProxyRoute, PulseConfig } from '../types';
import { walkFiles } from './utils';

function normalizeEndpoint(raw: string): string {
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

// Pass 1: Parse API module files to build function-to-endpoint map
export function buildApiModuleMap(
  config: PulseConfig,
): Map<string, { endpoint: string; method: string }> {
  const map = new Map<string, { endpoint: string; method: string }>();
  const apiDir = path.join(config.frontendDir, 'lib', 'api');
  if (!fs.existsSync(apiDir)) {
    return map;
  }

  const files = walkFiles(apiDir, ['.ts']);
  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
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
        // Scan next 15 lines for apiFetch call
        const block = lines.slice(i, Math.min(i + 15, lines.length)).join('\n');
        const apiMatch = block.match(
          /apiFetch\s*(?:<[^(]*>)?\s*\(\s*(?:['"`]([^'"`]*)['"`]|`([^`]*)`)/,
        );
        if (apiMatch) {
          const ep = normalizeEndpoint(apiMatch[1] || apiMatch[2]);
          const method = detectMethod(block);
          map.set(funcMatch[1], { endpoint: ep, method });
        }
      }

      // Object method: list: (params) => apiFetch(...)  or  list: async () => apiFetch(...)
      if (objectName) {
        const methodMatch = line.match(/^\s+(\w+)\s*[:=]\s*(?:async\s+)?\(?/);
        if (methodMatch) {
          const block = lines.slice(i, Math.min(i + 20, lines.length)).join('\n');
          const apiMatch = block.match(
            /apiFetch\s*(?:<[^(]*>)?\s*\(\s*(?:['"`]([^'"`]*)['"`]|`([^`]*)`)/,
          );
          if (apiMatch) {
            const ep = normalizeEndpoint(apiMatch[1] || apiMatch[2]);
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
                const wrapperDef = content.match(
                  new RegExp(
                    `function\\s+${wrapperName}[\\s\\S]*?apiFetch[^(]*\\(\\s*\`([^$\`]*?)\\$\\{`,
                  ),
                );
                const prefix = wrapperDef ? wrapperDef[1] : '';
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
  const files = walkFiles(config.frontendDir, ['.ts', '.tsx']);

  for (const file of files) {
    // Skip test files and type-only files
    if (/\.(test|spec|d)\.ts/.test(file)) {
      continue;
    }

    try {
      const content = fs.readFileSync(file, 'utf8');
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

        // Pattern 3: fetch(`${API_BASE}/endpoint`) or fetch('/api/...')
        const fetchMatches = [
          ...line.matchAll(
            /fetch\s*\(\s*`\$\{(?:API_BASE|API_URL|apiBase|getServerApiBase\(\))\}([^`]*)`/g,
          ),
          ...line.matchAll(/fetch\s*\(\s*['"`](\/api\/[^'"`]+)['"`]/g),
        ];
        for (const m of fetchMatches) {
          const raw = m[1];
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
  const apiDir = path.join(config.frontendDir, 'app', 'api');
  if (!fs.existsSync(apiDir)) {
    return routes;
  }

  const routeFiles = walkFiles(apiDir, ['.ts']).filter((f) => f.endsWith('route.ts'));

  for (const file of routeFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
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
