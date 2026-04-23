import type { UIElement } from '../types';
import { extractApiCallEndpoints, type ApiModuleMap } from '../ui-api-calls';
import type { HookRegistry } from './hook-registry';
import {
  bodyCallsHookFunction,
  callsCallbackProp,
  escapeRegExp,
  findFunctionDeclarationIndex,
  findFunctionBodyEnd,
  hasFunctionCall,
  hasFunctionOrMemberUse,
  hasApiCall,
  hookFunctionApiCalls,
  NAV_PATTERNS,
} from './ui-handler-resolver-utils';

export { componentHasSaveHandler } from './ui-handler-resolver-utils';

interface ResolveHandlerInput {
  handlerExpr: string;
  lines: string[];
  fileContent: string;
  hookDestructures: Map<string, { hookName: string; funcName: string }>;
  hookRegistry: HookRegistry;
  hasSaveHandler: boolean;
  apiImportsInFile: Set<string>;
  apiModuleMap: ApiModuleMap;
}

/** Resolve handler. */
export function resolveHandler(input: ResolveHandlerInput): {
  type: UIElement['handlerType'];
  apiCalls: string[];
} {
  const {
    handlerExpr,
    lines,
    hookDestructures,
    hookRegistry,
    hasSaveHandler,
    apiImportsInFile,
    apiModuleMap,
  } = input;
  const trimmed = handlerExpr.trim();

  if (
    trimmed === '() => {}' ||
    trimmed === '()=>{}' ||
    trimmed === '() => { }' ||
    trimmed === 'noop' ||
    /^\(\)\s*=>\s*console\.\w+/.test(trimmed) ||
    /^\(\)\s*=>\s*null$/.test(trimmed) ||
    /^\(\)\s*=>\s*undefined$/.test(trimmed)
  ) {
    return { type: 'noop', apiCalls: [] };
  }

  for (const p of NAV_PATTERNS) {
    if (p.test(trimmed)) {
      return { type: 'navigation', apiCalls: [] };
    }
  }

  const apiCalls = extractApiCallEndpoints(trimmed, apiModuleMap, apiImportsInFile);
  if (hasApiCall(trimmed)) {
    return { type: 'real', apiCalls };
  }

  for (const [localName] of hookDestructures) {
    const callRe = new RegExp(`(^|[^.\\w$])${escapeRegExp(localName)}\\s*\\(`);
    if (callRe.test(trimmed)) {
      return {
        type: 'real',
        apiCalls: hookFunctionApiCalls(trimmed, hookDestructures, hookRegistry),
      };
    }
  }

  if (apiImportsInFile.size > 0) {
    for (const importedName of apiImportsInFile) {
      if (trimmed.includes(importedName)) {
        return { type: 'real', apiCalls };
      }
    }
  }

  const funcNameMatch = trimmed.match(/^(\w+)$/);
  if (funcNameMatch) {
    return resolveNamedFunction({
      ...input,
      funcName: funcNameMatch[1],
    });
  }

  const inlineCallMatch = trimmed.match(/(?:\([^)]*\))?\s*=>\s*(?:\{?\s*)?(?:void\s+)?(\w+)\s*\(/);
  if (inlineCallMatch) {
    return resolveInlineCall({
      ...input,
      calledFunc: inlineCallMatch[1],
    });
  }

  if (/\(\)\s*=>\s*set\w+\s*\(/.test(trimmed)) {
    return { type: 'real', apiCalls: [] };
  }

  if (/\(\w*\)\s*=>\s*set\w+\s*\(/.test(trimmed)) {
    return { type: 'real', apiCalls: [] };
  }

  if (/confirm\s*\(/.test(trimmed)) {
    return { type: 'real', apiCalls: [] };
  }

  return { type: 'real', apiCalls: [] };
}

function resolveNamedFunction(input: ResolveHandlerInput & { funcName: string }): {
  type: UIElement['handlerType'];
  apiCalls: string[];
} {
  const {
    funcName,
    lines,
    fileContent,
    hookDestructures,
    hookRegistry,
    hasSaveHandler,
    apiImportsInFile,
    apiModuleMap,
  } = input;

  if (hookDestructures.has(funcName)) {
    return {
      type: 'real',
      apiCalls: hookFunctionApiCalls(`${funcName}()`, hookDestructures, hookRegistry),
    };
  }

  const defIdx = findFunctionDeclarationIndex(lines, funcName);
  if (defIdx === -1 && /^on[A-Z]/.test(funcName)) {
    return { type: 'real', apiCalls: [] };
  }
  if (defIdx === -1) {
    return { type: 'real', apiCalls: [] };
  }

  const bodyEnd = findFunctionBodyEnd(lines, defIdx, 60, 40);
  const bodyText = lines.slice(defIdx, bodyEnd).join('\n');
  const bodyApiCalls = extractApiCallEndpoints(bodyText, apiModuleMap, apiImportsInFile);

  if (hasApiCall(bodyText)) {
    return { type: 'real', apiCalls: bodyApiCalls };
  }

  if (bodyCallsHookFunction(bodyText, hookDestructures, hookRegistry)) {
    return {
      type: 'real',
      apiCalls: hookFunctionApiCalls(bodyText, hookDestructures, hookRegistry),
    };
  }

  for (const importedName of apiImportsInFile) {
    if (hasFunctionOrMemberUse(bodyText, importedName)) {
      return { type: 'real', apiCalls: bodyApiCalls };
    }
  }
  if (bodyApiCalls.length > 0) {
    return { type: 'real', apiCalls: bodyApiCalls };
  }

  if (/useCallback\s*\(/.test(bodyText)) {
    return { type: 'real', apiCalls: [] };
  }

  if (
    /\w+Instance(?:\??\.\w+)+\s*\(|\w+Ref\.current(?:\??\.\w+)+\s*\(|canvas\.\w+\s*\(/i.test(
      bodyText,
    )
  ) {
    return { type: 'real', apiCalls: [] };
  }

  if (
    /URL\.createObjectURL|document\.createElement\s*\(\s*['"]a['"]\)|\.download\s*=|Blob\s*\(/i.test(
      bodyText,
    )
  ) {
    return { type: 'real', apiCalls: [] };
  }

  for (const p of NAV_PATTERNS) {
    if (p.test(bodyText)) {
      return { type: 'navigation', apiCalls: [] };
    }
  }

  const nestedResult = resolveNestedLocalCall(input, bodyText);
  if (nestedResult) {
    return nestedResult;
  }

  const isSaveFunction =
    /^(?:handle)?(?:save|submit)\b/i.test(funcName) ||
    /^(?:on)(?:Save|Submit)\b/.test(funcName) ||
    /^(?:do|confirm)(?:Save|Submit|Create)\b/i.test(funcName);
  if (!isSaveFunction && hasSaveHandler && /set\w+\s*\(/.test(bodyText)) {
    return { type: 'real', apiCalls: [] };
  }

  if (callsCallbackProp(bodyText, fileContent)) {
    return { type: 'real', apiCalls: [] };
  }

  const isStateUpdater = /set\w+\s*\(|updateForm\s*\(|dispatch\s*\(|toggle\s*\(/.test(bodyText);
  if (!isSaveFunction && isStateUpdater && !hasApiCall(bodyText)) {
    return { type: 'real', apiCalls: [] };
  }

  return { type: 'dead', apiCalls: [] };
}

function resolveInlineCall(input: ResolveHandlerInput & { calledFunc: string }): {
  type: UIElement['handlerType'];
  apiCalls: string[];
} {
  const { calledFunc, hookDestructures, hasSaveHandler, lines } = input;

  if (hookDestructures.has(calledFunc)) {
    return {
      type: 'real',
      apiCalls: hookFunctionApiCalls(`${calledFunc}()`, hookDestructures, input.hookRegistry),
    };
  }

  if (/^set[A-Z]/.test(calledFunc)) {
    return { type: 'real', apiCalls: [] };
  }

  if (/^on[A-Z]/.test(calledFunc)) {
    if (findFunctionDeclarationIndex(lines, calledFunc) === -1) {
      return { type: 'real', apiCalls: [] };
    }
  }

  const result = resolveHandler({
    ...input,
    handlerExpr: calledFunc,
  });

  if (result.type === 'dead' && hasSaveHandler) {
    const defIdx = findFunctionDeclarationIndex(lines, calledFunc);
    if (defIdx !== -1) {
      const bodyText = lines.slice(defIdx, Math.min(defIdx + 20, lines.length)).join('\n');
      if (/set\w+\s*\(/.test(bodyText)) {
        return { type: 'real', apiCalls: [] };
      }
    }
  }

  return result;
}

function resolveNestedLocalCall(
  input: ResolveHandlerInput & { funcName: string },
  bodyText: string,
  visited = new Set<string>(),
  depth = 0,
): { type: UIElement['handlerType']; apiCalls: string[] } | null {
  const { fileContent, lines, apiModuleMap, apiImportsInFile, hookDestructures, hookRegistry } =
    input;
  if (depth > 4) {
    return null;
  }

  const localCallRe = /\b([a-z]\w+)\s*\(/gi;
  let lcMatch;
  while ((lcMatch = localCallRe.exec(bodyText)) !== null) {
    const cn = lcMatch[1];
    if (
      /^(?:if|for|while|return|await|catch|try|console|Math|JSON|Array|Object|String|Number|parseInt|parseFloat|setTimeout|clearTimeout|setInterval|Date|Promise|Error|require)$/.test(
        cn,
      )
    ) {
      continue;
    }
    if (/^set[A-Z]|^get[A-Z]/.test(cn)) {
      continue;
    }
    if (visited.has(cn)) {
      continue;
    }

    const cnIdx = findFunctionDeclarationIndex(lines, cn);
    if (cnIdx === -1) {
      continue;
    }
    visited.add(cn);

    const cnBody = lines.slice(cnIdx, findFunctionBodyEnd(lines, cnIdx, 90, 45)).join('\n');
    const cnApiCalls = extractApiCallEndpoints(cnBody, apiModuleMap, apiImportsInFile);
    if (hasApiCall(cnBody) || cnApiCalls.length > 0) {
      return {
        type: 'real',
        apiCalls: cnApiCalls,
      };
    }
    if (bodyCallsHookFunction(cnBody, hookDestructures, hookRegistry)) {
      return {
        type: 'real',
        apiCalls: hookFunctionApiCalls(cnBody, hookDestructures, hookRegistry),
      };
    }

    const nested = resolveNestedLocalCall(input, cnBody, visited, depth + 1);
    if (nested) {
      return nested;
    }
  }

  return null;
}
