import { safeJoin } from '../safe-path';
import type { PulseConfig } from '../types.manifest';
import { walkFiles } from './utils';
import { pathExists, readTextFile } from '../safe-fs';
import {
  discoverAllObservedHttpMethods,
  discoverReservedJsKeywords,
} from '../dynamic-reality-kernel/catalog-arithmetic';
import { getFrontendSourceDirs } from '../frontend-roots';

/** Hook function shape. */
export interface HookFunction {
  /** Method property. */
  method: string;
  /** Endpoint property. */
  endpoint: string;
}

// hookName -> { funcName -> { method, endpoint } }
export type HookRegistry = Map<string, Map<string, HookFunction>>;

function normalizeEndpoint(raw: string): string {
  let p = raw;
  p = p.replace(/\$\{buildQuery\b.*$/g, '');
  p = p.replace(/\$\{(?:qs|query|q|search|queryString|params)\b[^}]*\}?/gi, '');
  p = p.replace(/\$\{\w+$/g, '');
  p = p.replace(/\$\{encodeURIComponent\((\w+)\)\}/g, ':$1');
  p = p.replace(/\$\{(\w+)\}/g, ':$1');
  p = p.replace(/\$\{[^}]+\}/g, ':param');
  p = p.split('?')[0];
  p = p.replace(/[\)\}\]]+$/, '');
  p = p.replace(/\/+$/, '');
  if (!p.startsWith('/')) {
    p = '/' + p;
  }
  return p.replace(/\/+/g, '/');
}

function detectMethod(context: string): string {
  const observedMethods = discoverAllObservedHttpMethods();
  const methodPattern = observedMethods.map(escapeRegExp).join('|');
  const m = context.match(new RegExp(`method\\s*:\\s*['"\`](${methodPattern})['"\`]`, 'i'));
  if (m) {
    return m[1].toUpperCase();
  }
  for (const method of observedMethods) {
    if (new RegExp(`\\.${escapeRegExp(method.toLowerCase())}\\s*\\(`, 'i').test(context)) {
      return method.toUpperCase();
    }
  }
  return 'GET';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sliceLocalFunctionBody(lines: string[], startLine: number): string {
  let depth = 0;
  let bodyStarted = false;
  const endLimit = Math.min(startLine + 80, lines.length);

  for (let i = startLine; i < endLimit; i++) {
    const line = lines[i] || '';
    for (const ch of line) {
      if (ch === '{') {
        depth++;
        bodyStarted = true;
      }
      if (ch === '}') {
        depth--;
      }
    }

    if (bodyStarted && depth === 0) {
      return lines.slice(startLine, i + 1).join('\n');
    }
    if (!bodyStarted && i > startLine && line.trimEnd().endsWith(';')) {
      return lines.slice(startLine, i + 1).join('\n');
    }
  }

  return lines.slice(startLine, endLimit).join('\n');
}

/**
 * Build a registry of all custom hooks and the API calls their returned functions make.
 *
 * Handles patterns like:
 *   export function useProductMutations() {
 *     const createProduct = async (body) => {
 *       return apiFetch('/products', { method: 'POST', body });
 *     };
 *     return { createProduct, updateProduct, deleteProduct };
 *   }
 *
 * Also handles hooks that return SWR data + mutation functions.
 */
export function buildHookRegistry(config: PulseConfig): HookRegistry {
  const registry: HookRegistry = new Map();
  const frontendSourceDirs = getFrontendSourceDirs(config);
  const files = frontendSourceDirs.flatMap((frontendDir) => {
    const hooksDir = safeJoin(frontendDir, 'hooks');
    if (!pathExists(hooksDir)) {
      return [];
    }
    return walkFiles(hooksDir, ['.ts', '.tsx']);
  });

  for (const file of files) {
    try {
      const content = readTextFile(file, 'utf8');
      const lines = content.split('\n');

      // Find all exported hook functions in this file
      // Pattern: export function useXxx(
      const hookMatches = content.matchAll(/export\s+function\s+(use\w+)\s*\(/g);

      for (const hookMatch of hookMatches) {
        const hookName = hookMatch[1];
        const hookStartIdx = content.substring(0, hookMatch.index).split('\n').length - 1;
        const funcMap = new Map<string, HookFunction>();

        // Find the hook's body (brace-depth tracking)
        let depth = 0;
        let hookBodyStart = -1;
        let hookBodyEnd = -1;

        for (let i = hookStartIdx; i < lines.length; i++) {
          for (const ch of lines[i]) {
            if (ch === '{') {
              if (depth === 0) {
                hookBodyStart = i;
              }
              depth++;
            }
            if (ch === '}') {
              depth--;
            }
          }
          if (hookBodyStart !== -1 && depth === 0) {
            hookBodyEnd = i;
            break;
          }
        }

        if (hookBodyStart === -1 || hookBodyEnd === -1) {
          continue;
        }
        const hookBody = lines.slice(hookBodyStart, hookBodyEnd + 1).join('\n');

        // Find all inner functions that call apiFetch
        // Pattern: const funcName = async (...) => { ... apiFetch('/api/v1/resource', { method: 'POST' }) ... }
        // Pattern: async function funcName(...) { ... apiFetch(...) ... }
        // Pattern: funcName: async (...) => apiFetch(...)
        const innerFuncRe =
          /(?:const|let)\s+(\w+)\s*=\s*(?:useCallback\s*\(\s*)?(?:async\s+)?\([^)]*\)\s*(?::\s*[\w<>\[\]|,\s]+)?\s*=>\s*\{?/g;
        let innerMatch;
        const hookBodyLines = hookBody.split('\n');

        while ((innerMatch = innerFuncRe.exec(hookBody)) !== null) {
          const funcName = innerMatch[1];
          // Get the function body (~20 lines after declaration)
          const funcStartLine = hookBody.substring(0, innerMatch.index).split('\n').length - 1;
          const funcBodyText = sliceLocalFunctionBody(hookBodyLines, funcStartLine);

          // Look for apiFetch call
          const apiMatch = funcBodyText.match(
            /apiFetch\s*(?:<[^>]*>)?\s*\(\s*(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/,
          );
          if (apiMatch) {
            const rawEndpoint = apiMatch[1] || apiMatch[2];
            const endpoint = normalizeEndpoint(rawEndpoint);
            const method = detectMethod(funcBodyText);
            funcMap.set(funcName, { method, endpoint });
          }

          // Also check for api.get/api.post pattern
          const apiObjMatch = funcBodyText.match(
            /api\.(get|post|put|patch|delete)\s*\(\s*(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/i,
          );
          if (apiObjMatch && !funcMap.has(funcName)) {
            const rawEndpoint = apiObjMatch[2] || apiObjMatch[3];
            const endpoint = normalizeEndpoint(rawEndpoint);
            funcMap.set(funcName, { method: apiObjMatch[1].toUpperCase(), endpoint });
          }
        }

        // Also find return statement to map returned function names
        const returnMatch = hookBody.match(/return\s*\{([^}]+)\}/);
        if (returnMatch) {
          // Return statement references inner functions already in funcMap
        }

        if (funcMap.size > 0) {
          registry.set(hookName, funcMap);
        }
      }

      // Also handle hooks that destructure from API modules and return the functions
      // Pattern: const { create, update, del } = someApi; return { create, update, del }
      // This is less common but handle crmApi, productApi etc.
      const apiObjectImports = content.matchAll(
        /import\s*\{([^}]+)\}\s*from\s*['"]@\/lib\/api(?:\/\w+)?['"]/g,
      );
      for (const imp of apiObjectImports) {
        const imported = imp[1].split(',').map((s) => s.trim().split(' as ').pop()!.trim());
        // Check if any imported API objects are used in hooks
        for (const apiObj of imported) {
          if (!apiObj.endsWith('Api') && !apiObj.endsWith('api')) {
            continue;
          }
          // Restrict apiObj to a plain JS identifier so the regex source
          // below is bounded (no metachars, no ReDoS surface).
          if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(apiObj)) {
            continue;
          }
          // Find methods called on this API object within hook bodies
          const methodCallRe = new RegExp(`${apiObj}\\.(\\w+)\\s*\\(`, 'g');
          // Methods called on this API object within hook bodies
          // are captured as potential API calls from hooks
          // but need to be matched against the API module map
          methodCallRe.exec(content);
        }
      }
    } catch (e) {
      process.stderr.write(
        `  [warn] Could not build hook registry from ${file}: ${(e as Error).message}\n`,
      );
    }
  }

  // Also parse API module files to find object-based APIs
  // productApi.list → apiFetch('/products')
  for (const frontendDir of frontendSourceDirs) {
    const apiDir = safeJoin(frontendDir, 'lib', 'api');
    if (!pathExists(apiDir)) {
      continue;
    }
    const apiFiles = walkFiles(apiDir, ['.ts']);
    for (const file of apiFiles) {
      try {
        const content = readTextFile(file, 'utf8');
        const lines = content.split('\n');

        // Find exported API objects: export const productApi = { ... }
        const objectMatches = content.matchAll(/export\s+const\s+(\w+(?:Api|api))\s*=\s*\{/gi);
        for (const objMatch of objectMatches) {
          const objName = objMatch[1];
          const funcMap = new Map<string, HookFunction>();

          // Find methods inside the object
          const objStartIdx = content.substring(0, objMatch.index).split('\n').length - 1;
          let depth = 0;
          let objStart = -1;
          let objEnd = -1;

          for (let i = objStartIdx; i < lines.length; i++) {
            for (const ch of lines[i]) {
              if (ch === '{') {
                if (depth === 0) {
                  objStart = i;
                }
                depth++;
              }
              if (ch === '}') {
                depth--;
              }
            }
            if (objStart !== -1 && depth === 0) {
              objEnd = i;
              break;
            }
          }

          if (objStart === -1 || objEnd === -1) {
            continue;
          }
          const objBody = lines.slice(objStart, objEnd + 1).join('\n');

          // Find method definitions
          const methodRe = /(\w+)\s*[:=]\s*(?:async\s+)?\(?/g;
          let methodMatch;
          while ((methodMatch = methodRe.exec(objBody)) !== null) {
            const methodName = methodMatch[1];
            if (discoverReservedJsKeywords().has(methodName)) {
              continue;
            }

            const methodStartLine = objBody.substring(0, methodMatch.index).split('\n').length - 1;
            const methodBlock = objBody.split('\n').slice(methodStartLine).join('\n');

            const apiMatch = methodBlock.match(
              /apiFetch\s*(?:<[^>]*>)?\s*\(\s*(?:['"`]([^'"`]+)['"`]|`([^`]+)`)/,
            );
            if (apiMatch) {
              const rawEndpoint = apiMatch[1] || apiMatch[2];
              const endpoint = normalizeEndpoint(rawEndpoint);
              const method = detectMethod(methodBlock);
              funcMap.set(methodName, { method, endpoint });
            }
          }

          if (funcMap.size > 0) {
            registry.set(objName, funcMap);
          }
        }
      } catch (e) {
        // skip
      }
    }
  }

  return registry;
}

/**
 * Parse a component file to find all hook destructuring patterns.
 * Returns a map of localFunctionName -> { hookName, funcName }
 *
 * Handles: const { deleteProduct, updateProduct } = useProductMutations();
 */
export function extractHookDestructures(
  fileContent: string,
): Map<string, { hookName: string; funcName: string }> {
  const map = new Map<string, { hookName: string; funcName: string }>();

  // Pattern: const { func1, func2, func3: alias } = useHookName(...)
  const destructureRe = /const\s*\{([^}]+)\}\s*=\s*(use\w+)\s*\(/g;
  let match;

  while ((match = destructureRe.exec(fileContent)) !== null) {
    const destructuredNames = match[1];
    const hookName = match[2];

    // Parse each destructured name (handle renaming: original: alias)
    const names = destructuredNames
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    for (const name of names) {
      const parts = name.split(':').map((s) => s.trim());
      const originalName = parts[0];
      const localName = parts.length > 1 ? parts[1] : parts[0];

      // Skip common SWR returns that aren't API functions
      if (['data', 'error', 'isLoading', 'mutate', 'isValidating'].includes(originalName)) {
        continue;
      }

      map.set(localName, { hookName, funcName: originalName });
    }
  }

  return map;
}
