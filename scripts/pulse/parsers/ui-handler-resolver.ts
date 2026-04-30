import type { UIElement } from '../types';
import { extractApiCallEndpoints, type ApiModuleMap } from '../ui-api-calls';
import type { HookRegistry } from './hook-registry';
import {
  bodyCallsHookFunction,
  callsCallbackProp,
  findFunctionDeclarationIndex,
  findFunctionBodyEnd,
  hasBrowserNavigationEffect,
  hasFunctionCall,
  hasFunctionOrMemberUse,
  hasApiCall,
  hookFunctionApiCalls,
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

type HandlerResolution = {
  type: UIElement['handlerType'];
  apiCalls: string[];
};

const HANDLER_TYPE_NOOP: UIElement['handlerType'] = 'noop';
const HANDLER_TYPE_NAVIGATION: UIElement['handlerType'] = 'navigation';
const HANDLER_TYPE_REAL: UIElement['handlerType'] = 'real';
const HANDLER_TYPE_DEAD: UIElement['handlerType'] = 'dead';

function handlerResolution(
  type: UIElement['handlerType'],
  apiCalls: string[] = [],
): HandlerResolution {
  return { type, apiCalls };
}

/** Resolve handler. */
export function resolveHandler(input: ResolveHandlerInput): HandlerResolution {
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
    return handlerResolution(HANDLER_TYPE_NOOP);
  }

  if (hasBrowserNavigationEffect(trimmed)) {
    return handlerResolution(HANDLER_TYPE_NAVIGATION);
  }

  const apiCalls = extractApiCallEndpoints(trimmed, apiModuleMap, apiImportsInFile);
  if (hasApiCall(trimmed)) {
    return handlerResolution(HANDLER_TYPE_REAL, apiCalls);
  }

  for (const [localName] of hookDestructures) {
    if (hasFunctionCall(trimmed, localName)) {
      return {
        type: HANDLER_TYPE_REAL,
        apiCalls: hookFunctionApiCalls(trimmed, hookDestructures, hookRegistry),
      };
    }
  }

  if (apiImportsInFile.size > 0) {
    for (const importedName of apiImportsInFile) {
      if (trimmed.includes(importedName)) {
        return handlerResolution(HANDLER_TYPE_REAL, apiCalls);
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
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  if (/\(\w*\)\s*=>\s*set\w+\s*\(/.test(trimmed)) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  if (/confirm\s*\(/.test(trimmed)) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  return handlerResolution(HANDLER_TYPE_REAL);
}

function resolveNamedFunction(
  input: ResolveHandlerInput & { funcName: string },
): HandlerResolution {
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
      type: HANDLER_TYPE_REAL,
      apiCalls: hookFunctionApiCalls(`${funcName}()`, hookDestructures, hookRegistry),
    };
  }

  const defIdx = findFunctionDeclarationIndex(lines, funcName);
  if (defIdx === -1 && /^on[A-Z]/.test(funcName)) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }
  if (defIdx === -1) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  const bodyEnd = findFunctionBodyEnd(lines, defIdx, 60, 40);
  const bodyText = lines.slice(defIdx, bodyEnd).join('\n');
  const bodyApiCalls = extractApiCallEndpoints(bodyText, apiModuleMap, apiImportsInFile);

  if (hasApiCall(bodyText)) {
    return handlerResolution(HANDLER_TYPE_REAL, bodyApiCalls);
  }

  if (bodyCallsHookFunction(bodyText, hookDestructures, hookRegistry)) {
    return {
      type: HANDLER_TYPE_REAL,
      apiCalls: hookFunctionApiCalls(bodyText, hookDestructures, hookRegistry),
    };
  }

  for (const importedName of apiImportsInFile) {
    if (hasFunctionOrMemberUse(bodyText, importedName)) {
      return handlerResolution(HANDLER_TYPE_REAL, bodyApiCalls);
    }
  }
  if (bodyApiCalls.length > 0) {
    return handlerResolution(HANDLER_TYPE_REAL, bodyApiCalls);
  }

  if (/useCallback\s*\(/.test(bodyText)) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  if (
    /\w+Instance(?:\??\.\w+)+\s*\(|\w+Ref\.current(?:\??\.\w+)+\s*\(|canvas\.\w+\s*\(/i.test(
      bodyText,
    )
  ) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  if (
    /URL\.createObjectURL|document\.createElement\s*\(\s*['"]a['"]\)|\.download\s*=|Blob\s*\(/i.test(
      bodyText,
    )
  ) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  if (hasBrowserNavigationEffect(bodyText)) {
    return handlerResolution(HANDLER_TYPE_NAVIGATION);
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
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  if (callsCallbackProp(bodyText, fileContent)) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  const isStateUpdater = /set\w+\s*\(|updateForm\s*\(|dispatch\s*\(|toggle\s*\(/.test(bodyText);
  if (!isSaveFunction && isStateUpdater && !hasApiCall(bodyText)) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  return handlerResolution(HANDLER_TYPE_DEAD);
}

function resolveInlineCall(input: ResolveHandlerInput & { calledFunc: string }): HandlerResolution {
  const { calledFunc, hookDestructures, hasSaveHandler, lines } = input;

  if (hookDestructures.has(calledFunc)) {
    return {
      type: HANDLER_TYPE_REAL,
      apiCalls: hookFunctionApiCalls(`${calledFunc}()`, hookDestructures, input.hookRegistry),
    };
  }

  if (/^set[A-Z]/.test(calledFunc)) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  if (/^on[A-Z]/.test(calledFunc)) {
    if (findFunctionDeclarationIndex(lines, calledFunc) === -1) {
      return handlerResolution(HANDLER_TYPE_REAL);
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
        return handlerResolution(HANDLER_TYPE_REAL);
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
        type: HANDLER_TYPE_REAL,
        apiCalls: cnApiCalls,
      };
    }
    if (bodyCallsHookFunction(cnBody, hookDestructures, hookRegistry)) {
      return {
        type: HANDLER_TYPE_REAL,
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
