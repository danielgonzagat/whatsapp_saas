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

function isNoopArrow(value: string): boolean {
  const compact = value
    .split('')
    .filter((char) => char.trim().length > 0)
    .join('');
  if (!compact.startsWith('()=>')) {
    return false;
  }
  const body = compact.slice('()=>'.length);
  return body.startsWith('console.') || body === 'null' || body === 'undefined';
}

function isIdentifierToken(value: string): boolean {
  if (value.length === 0 || !isIdentifierStart(value[0])) {
    return false;
  }
  return value.split('').every(isIdentifierPart);
}

function isIdentifierStart(char: string): boolean {
  return (char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z') || char === '_';
}

function isIdentifierPart(char: string): boolean {
  return isIdentifierStart(char) || (char >= '0' && char <= '9');
}

function extractInlineCalledFunction(value: string): string | null {
  const arrowIndex = value.indexOf('=>');
  if (arrowIndex < 0) {
    return null;
  }
  let body = value.slice(arrowIndex + 2).trimStart();
  if (body.startsWith('{')) {
    body = body.slice(1).trimStart();
  }
  if (body.startsWith('void ')) {
    body = body.slice('void '.length).trimStart();
  }
  const name = readIdentifier(body);
  if (!name) {
    return null;
  }
  const afterName = body.slice(name.length).trimStart();
  return afterName.startsWith('(') ? name : null;
}

function readIdentifier(value: string): string {
  let output = '';
  for (const char of value) {
    if (
      (output.length === 0 && isIdentifierStart(char)) ||
      (output.length > 0 && isIdentifierPart(char))
    ) {
      output += char;
      continue;
    }
    break;
  }
  return output;
}

function inlineCallsFunctionPrefix(value: string, prefix: string): boolean {
  const calledFunction = extractInlineCalledFunction(value);
  return Boolean(calledFunction && startsWithPrefixCapital(calledFunction, prefix));
}

function startsWithPrefixCapital(value: string, prefix: string): boolean {
  if (!value.startsWith(prefix) || value.length <= prefix.length) {
    return false;
  }
  const next = value[prefix.length];
  return next >= 'A' && next <= 'Z';
}

function hasImperativeUiEffect(value: string): boolean {
  return value.includes('Instance') || value.includes('Ref.current') || value.includes('canvas.');
}

function hasBrowserFileEffect(value: string): boolean {
  return (
    value.includes('URL.createObjectURL') ||
    value.includes('document.createElement') ||
    value.includes('.download') ||
    value.includes('Blob(')
  );
}

function isSaveLikeFunctionName(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower === 'save' ||
    lower === 'submit' ||
    lower.startsWith('handlesave') ||
    lower.startsWith('handlesubmit') ||
    lower.startsWith('onsave') ||
    lower.startsWith('onsubmit') ||
    lower.startsWith('dosave') ||
    lower.startsWith('dosubmit') ||
    lower.startsWith('docreate') ||
    lower.startsWith('confirmsave') ||
    lower.startsWith('confirmsubmit') ||
    lower.startsWith('confirmcreate')
  );
}

function bodyCallsFunctionPrefix(value: string, prefix: string): boolean {
  return extractCalledFunctionNames(value).some((name) => startsWithPrefixCapital(name, prefix));
}

function hasStateUpdaterCall(value: string): boolean {
  const names = new Set(extractCalledFunctionNames(value));
  return (
    [...names].some((name) => startsWithPrefixCapital(name, 'set')) ||
    names.has('updateForm') ||
    names.has('dispatch') ||
    names.has('toggle')
  );
}

function extractCalledFunctionNames(value: string): string[] {
  const names: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const name = readIdentifier(value.slice(index));
    if (!name) {
      continue;
    }
    const afterNameIndex = index + name.length;
    const rest = value.slice(afterNameIndex).trimStart();
    if (rest.startsWith('(')) {
      names.push(name);
    }
    index = afterNameIndex;
  }
  return [...new Set(names)];
}

function isBuiltinOrControlCall(value: string): boolean {
  return [
    'if',
    'for',
    'while',
    'return',
    'await',
    'catch',
    'try',
    'console',
    'Math',
    'JSON',
    'Array',
    'Object',
    'String',
    'Number',
    'parseInt',
    'parseFloat',
    'setTimeout',
    'clearTimeout',
    'setInterval',
    'Date',
    'Promise',
    'Error',
    'require',
  ].includes(value);
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
    isNoopArrow(trimmed)
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

  if (isIdentifierToken(trimmed)) {
    return resolveNamedFunction({
      ...input,
      funcName: trimmed,
    });
  }

  const inlineCalledFunction = extractInlineCalledFunction(trimmed);
  if (inlineCalledFunction) {
    return resolveInlineCall({
      ...input,
      calledFunc: inlineCalledFunction,
    });
  }

  if (inlineCallsFunctionPrefix(trimmed, 'set')) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  if (hasFunctionCall(trimmed, 'confirm')) {
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
  if (defIdx === -1 && startsWithPrefixCapital(funcName, 'on')) {
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

  if (hasFunctionCall(bodyText, 'useCallback')) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  if (hasImperativeUiEffect(bodyText)) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  if (hasBrowserFileEffect(bodyText)) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  if (hasBrowserNavigationEffect(bodyText)) {
    return handlerResolution(HANDLER_TYPE_NAVIGATION);
  }

  const nestedResult = resolveNestedLocalCall(input, bodyText);
  if (nestedResult) {
    return nestedResult;
  }

  const isSaveFunction = isSaveLikeFunctionName(funcName);
  if (!isSaveFunction && hasSaveHandler && bodyCallsFunctionPrefix(bodyText, 'set')) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  if (callsCallbackProp(bodyText, fileContent)) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  const isStateUpdater = hasStateUpdaterCall(bodyText);
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

  if (startsWithPrefixCapital(calledFunc, 'set')) {
    return handlerResolution(HANDLER_TYPE_REAL);
  }

  if (startsWithPrefixCapital(calledFunc, 'on')) {
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
      if (bodyCallsFunctionPrefix(bodyText, 'set')) {
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

  for (const cn of extractCalledFunctionNames(bodyText)) {
    if (isBuiltinOrControlCall(cn)) {
      continue;
    }
    if (startsWithPrefixCapital(cn, 'set') || startsWithPrefixCapital(cn, 'get')) {
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
