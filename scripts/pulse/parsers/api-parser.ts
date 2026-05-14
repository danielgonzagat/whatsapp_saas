import { safeJoin } from '../safe-path';
import * as path from 'path';
import type { APICall } from '../types.core';
import type { PulseConfig } from '../types.manifest';
import { walkFiles } from './utils';
import { pathExists, readTextFile } from '../safe-fs';
import { getFrontendSourceDirs } from '../frontend-roots';
import { normalizeEndpoint } from './api-parser-normalize';
import { detectMethod } from './api-parser-string-utils';
import { deriveUnitValue } from '../dynamic-reality-kernel/catalog-arithmetic';
import { discoverSourceExtensionsFromObservedTypescript } from '../dynamic-reality-kernel/token-evidence';
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
export function buildApiModuleMap(
  config: PulseConfig,
): Map<string, { endpoint: string; method: string }> {
  const map = new Map<string, { endpoint: string; method: string }>();
  const apiDirs = getFrontendSourceDirs(config)
    .map((frontendDir) => safeJoin(frontendDir, 'lib', 'api'))
    .filter((apiDir) => pathExists(apiDir));
  const adminApiDir = path.resolve(config.rootDir, 'frontend-admin', 'src', 'lib', 'api');
  if (pathExists(adminApiDir)) {
    apiDirs.push(adminApiDir);
  }
  const files = apiDirs.flatMap((apiDir) =>
    walkFiles(apiDir, [...discoverSourceExtensionsFromObservedTypescript()]),
  );
  const wrapperPrefixes = buildFetchWrapperPrefixMap(files);
  for (const file of files) {
    const content = readTextFile(file, 'utf8');
    const lines = content.split('\n');
    let objectName: string | undefined;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const objDecl = line.match(/export\s+const\s+(\w+Api|\w+api)\s*=\s*\{/i);
      if (objDecl) {
        objectName = objDecl[1];
      }
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
function collectScanDirs(config: PulseConfig): string[] {
  const dirs: string[] = [];
  for (const dir of getFrontendSourceDirs(config)) {
    if (pathExists(dir)) dirs.push(dir);
  }
  const adminDir = path.resolve(config.rootDir, 'frontend-admin', 'src');
  if (pathExists(adminDir)) {
    dirs.push(adminDir);
  }
  if (config.workerDir && pathExists(config.workerDir)) {
    dirs.push(config.workerDir);
  }
  const e2eDir = path.resolve(config.rootDir, 'e2e');
  if (pathExists(e2eDir)) {
    dirs.push(e2eDir);
  }
  return dirs;
}
function deriveParserWindow(size: number): number {
  return Array.from({ length: size }, () => deriveUnitValue()).reduce(
    (sum, value) => sum + value,
    deriveUnitValue() - deriveUnitValue(),
  );
}
function extractCallStatementContext(lines: string[], lineIndex: number, matchStart: number, maxLines: number): string {
  const line = lines[lineIndex];
  let context = '';
  let parenDepth = 0;
  let started = false;
  for (let ci = matchStart; ci < line.length; ci++) {
    const ch = line[ci];
    context += ch;
    if (ch === '(') {
      parenDepth++;
      started = true;
    }
    if (ch === ')') {
      parenDepth--;
      if (started && parenDepth === 0) return context;
    }
  }
  if (started && parenDepth > 0) {
    for (let j = lineIndex + 1; j < Math.min(lineIndex + maxLines, lines.length); j++) {
      for (const ch of lines[j]) {
        context += ch;
        if (ch === '(') parenDepth++;
        if (ch === ')') {
          parenDepth--;
          if (parenDepth === 0) return context;
        }
      }
    }
  }
  return context;
}
export function parseAPICalls(config: PulseConfig): APICall[] {
  const calls: APICall[] = [];
  const seen = new Set<string>(); // dedup: file:line:endpoint
  const scanDirs = collectScanDirs(config);
  const files = scanDirs.flatMap((dir) =>
    walkFiles(dir, [...discoverSourceExtensionsFromObservedTypescript()]),
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
        const context = lines.slice(i, Math.min(i + deriveParserWindow(8), lines.length)).join('\n');
        const apiFetchMatches = [
          ...line.matchAll(/apiFetch\s*(?:<[^(]*>)?\s*\(\s*['"`]([^'"`]+)['"`]/g),
          ...line.matchAll(/apiFetch\s*(?:<[^(]*>)?\s*\(\s*`([^`]+)`/g),
        ];
        for (const m of apiFetchMatches) {
          const raw = m[1];
          const endpoint = normalizeEndpoint(raw);
          if (
            /^\/api:[a-z]/i.test(endpoint) ||
            endpoint === '/api' ||
            endpoint.length < deriveUnitValue() + deriveUnitValue() + deriveUnitValue()
          ) {
            continue;
          }
          const key = `${relFile}:${i + 1}:${endpoint}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          const stmtContext = extractCallStatementContext(lines, i, m.index || 0, deriveParserWindow(5));
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
        const adminFetchMatches = [
          ...line.matchAll(/adminFetch\s*(?:<[^(]*>)?\s*\(\s*['"`]([^'"`]+)['"`]/g),
          ...line.matchAll(/adminFetch\s*(?:<[^(]*>)?\s*\(\s*`([^`]+)`/g),
        ];
        for (const m of adminFetchMatches) {
          const raw = m[1];
          let endpoint = normalizeEndpoint(raw);
          if (endpoint.length < deriveUnitValue() + deriveUnitValue()) {
            continue;
          }
          endpoint = `/admin${endpoint}`;
          endpoint = endpoint.replace(/\/+/g, '/');
          const key = `${relFile}:${i + 1}:${endpoint}`;
          if (seen.has(key)) {
            continue;
          }
          seen.add(key);
          const stmtContext = extractCallStatementContext(lines, i, m.index || 0, deriveParserWindow(5));
          calls.push({
            file: relFile,
            line: i + 1,
            endpoint: raw,
            normalizedPath: endpoint,
            method: detectMethod(stmtContext),
            callPattern: 'adminFetch',
            isProxy: false,
            proxyTarget: null,
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
        const swrVarMatch = line.match(
          /useSWR\s*(?:<[^>]*>)?\s*\(\s*(\w+)\s*,\s*(?:swrFetcher|fetcher)/,
        );
        if (swrVarMatch) {
          const varName = swrVarMatch[1];
          let foundEndpoint: string | null = null;
          for (let li = Math.max(0, i - 30); li < i; li++) {
            const prevLine = lines[li];
            const buildCall = prevLine.match(
              /(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(\w+)\s*\(/,
            );
            if (buildCall && buildCall[1] !== swrVarMatch[1]) {
              continue;
            }
            if (buildCall) {
              const buildFnName = buildCall[2];
              const buildFnDefRe =
                /(?:function|const)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:[=:(]|\s*\()/g;
              const fnMatch = [...content.matchAll(buildFnDefRe)].find(
                (match) => match[1] === buildFnName,
              );
              if (fnMatch) {
                const fnStartIdx = content.substring(0, fnMatch.index).split('\n').length - 1;
                const fnBody = lines
                  .slice(fnStartIdx, Math.min(fnStartIdx + 30, lines.length))
                  .join('\n');
                const retMatch = fnBody.match(/return\s*(?:\`|\/)(\/[\w/-]+)/);
                if (retMatch) {
                  foundEndpoint = normalizeEndpoint(retMatch[1]);
                }
              }
              break;
            }
            const strMatch = prevLine.match(
              /(?:const|let)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*`?(\/[\w/-]+)/,
            );
            if (strMatch && strMatch[1] !== varName) {
              continue;
            }
            if (strMatch) {
              foundEndpoint = normalizeEndpoint(strMatch[2]);
              break;
            }
          }
          if (foundEndpoint) {
            const endpoint = foundEndpoint;
            const key = `${relFile}:${i + 1}:${endpoint}`;
            if (!seen.has(key)) {
              seen.add(key);
              calls.push({
                file: relFile,
                line: i + 1,
                endpoint,
                normalizedPath: endpoint,
                method: 'GET',
                callPattern: 'useSWR',
                isProxy: false,
                proxyTarget: null,
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
        const fetchMatches = [
          ...line.matchAll(
            /fetch\s*\(\s*`\$\{(?:API_BASE|API_URL|apiBase|getServerApiBase\(\))\}([^`]*)`/g,
          ),
          ...line.matchAll(/fetch\s*\(\s*['"`](\/api\/[^'"`]+)['"`]/g),
          ...line.matchAll(/fetch\s*\(\s*apiUrl\s*\(\s*(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/g),
        ];
        for (const m of fetchMatches) {
          const raw = m[1] || m[2];
          if (!raw || raw.length < deriveUnitValue() + deriveUnitValue()) {
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
        if (apiFetchMatches.length === 0 && /apiFetch\s*(?:<[^(]*>)?\s*\(\s*$/.test(line)) {
          const block = lines
            .slice(
              i,
              Math.min(
                i +
                  deriveUnitValue() +
                  deriveUnitValue() +
                  deriveUnitValue() +
                  deriveUnitValue() +
                  deriveUnitValue() +
                  deriveUnitValue(),
                lines.length,
              ),
            )
            .join('\n');
          const multiMatch = block.match(
            /apiFetch\s*(?:<[^>]*>)?\s*\(\s*\n\s*(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/,
          );
          if (multiMatch) {
            const raw = multiMatch[1] || multiMatch[2];
            if (raw) {
              const endpoint = normalizeEndpoint(raw);
              if (
                !/^\/api:[a-z]/i.test(endpoint) &&
                endpoint !== '/api' &&
                endpoint.length >= deriveUnitValue() + deriveUnitValue() + deriveUnitValue()
              ) {
                const key = `${relFile}:${i + 1}:${endpoint}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  const stmtCtx = extractCallStatementContext(lines, i, line.indexOf('apiFetch'), deriveParserWindow(6));
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
          const block = lines
            .slice(
              i,
              Math.min(
                i + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue(),
                lines.length,
              ),
            )
            .join('\n');
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
export { parseProxyRoutes } from './api-parser-proxy';
