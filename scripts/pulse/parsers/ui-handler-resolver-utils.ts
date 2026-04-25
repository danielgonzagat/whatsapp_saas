import type { HookRegistry } from './hook-registry';

/** Api_call_patterns. */
export const API_CALL_PATTERNS = [
  /apiFetch\s*\(/,
  /api\.\w+\s*\(/,
  /productApi\.\w+/,
  /crmApi\.\w+/,
  /billingApi\.\w+/,
  /workspaceApi\.\w+/,
  /externalPaymentApi\.\w+/,
  /knowledgeBaseApi\.\w+/,
  /kycApi\.\w+/,
  /segmentationApi\.\w+/,
  /kloelApi\.\w+/,
  /whatsappApi\.\w+/,
  /await\s+fetch\s*\(/,
  /\.mutate\s*\(/,
  /\.trigger\s*\(/,
];

/** Nav_patterns. */
export const NAV_PATTERNS = [
  /router\.push\s*\(/,
  /router\.replace\s*\(/,
  /window\.location/,
  /window\.open\s*\(/,
  /navigator\.clipboard/,
];

const SAVE_HANDLER_NAMES = [
  'handleSave',
  'save',
  'handleSubmit',
  'onSubmit',
  'onSave',
  'handleUpdate',
  'handleCreate',
  'submitForm',
  'doSave',
];

/** Component has save handler. */
export function componentHasSaveHandler(fileContent: string): boolean {
  const lines = fileContent.split('\n');
  for (const name of SAVE_HANDLER_NAMES) {
    const startIdx = findFunctionDeclarationIndex(lines, name);
    if (startIdx === -1) {
      continue;
    }

    const bodyText = lines.slice(startIdx, Math.min(startIdx + 40, lines.length)).join('\n');

    if (hasApiCall(bodyText)) {
      return true;
    }
  }

  return false;
}

function isIdentifierChar(value: string | undefined): boolean {
  return Boolean(value && /[\w$]/.test(value));
}

function hasIdentifierAt(text: string, offset: number, identifier: string): boolean {
  if (!text.startsWith(identifier, offset)) {
    return false;
  }
  return !isIdentifierChar(text[offset - 1]) && !isIdentifierChar(text[offset + identifier.length]);
}

export function hasFunctionCall(text: string, functionName: string): boolean {
  let offset = text.indexOf(functionName);
  while (offset !== -1) {
    if (hasIdentifierAt(text, offset, functionName)) {
      let cursor = offset + functionName.length;
      while (/\s/.test(text[cursor] || '')) {
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

export function hasFunctionOrMemberUse(text: string, identifier: string): boolean {
  let offset = text.indexOf(identifier);
  while (offset !== -1) {
    if (hasIdentifierAt(text, offset, identifier)) {
      let cursor = offset + identifier.length;
      while (/\s/.test(text[cursor] || '')) {
        cursor += 1;
      }
      if (text[cursor] === '(' || text[cursor] === '.') {
        return true;
      }
    }
    offset = text.indexOf(identifier, offset + identifier.length);
  }
  return false;
}

export function findFunctionDeclarationIndex(lines: string[], functionName: string): number {
  return lines.findIndex((line) => {
    const trimmed = line.trimStart();
    if (trimmed.startsWith(`function ${functionName}`)) {
      return true;
    }
    if (trimmed.startsWith(`async function ${functionName}`)) {
      return true;
    }
    return trimmed.startsWith(`const ${functionName}`) || trimmed.startsWith(`let ${functionName}`);
  });
}

/** Body calls hook function. */
export function bodyCallsHookFunction(
  bodyText: string,
  hookDestructures: Map<string, { hookName: string; funcName: string }>,
  hookRegistry: HookRegistry,
): boolean {
  for (const [localName, { hookName, funcName }] of hookDestructures) {
    if (!hasFunctionCall(bodyText, localName)) {
      continue;
    }

    const hookFuncs = hookRegistry.get(hookName);
    if (hookFuncs) {
      if (hookFuncs.has(funcName)) {
        return true;
      }
      if (hookFuncs.size > 0) {
        return true;
      }
    }

    if (/Mutation|mutation|create|update|delete|remove|add|save|submit/i.test(funcName)) {
      return true;
    }
  }

  return false;
}

/** Hook function api calls. */
export function hookFunctionApiCalls(
  bodyText: string,
  hookDestructures: Map<string, { hookName: string; funcName: string }>,
  hookRegistry: HookRegistry,
): string[] {
  const endpoints: string[] = [];

  for (const [localName, { hookName, funcName }] of hookDestructures) {
    // Source: `localName` originates from hook destructure parsing of source files
    // discovered by the PULSE scanner (trusted in-repo TS/TSX). Even so, we escape
    // it via `escapeRegExp` to neutralize any regex metacharacters and prevent
    // ReDoS / pattern-injection if the parser ever yields atypical identifiers.
    const callRe = new RegExp(`\\b${escapeRegExp(localName)}\\s*\\(`, 'g');
    if (!callRe.test(bodyText)) {
      continue;
    }

    const hookFunc = hookRegistry.get(hookName)?.get(funcName);
    if (hookFunc?.endpoint) {
      endpoints.push(hookFunc.endpoint);
    }
  }

  return [...new Set(endpoints)];
}

/** Has api call. */
export function hasApiCall(text: string): boolean {
  return API_CALL_PATTERNS.some((p) => p.test(text));
}

/** Escape reg exp. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Find function body end. */
export function findFunctionBodyEnd(
  lines: string[],
  startIdx: number,
  scanWindow: number,
  fallbackWindow: number,
): number {
  let depth = 0;
  let bodyStarted = false;
  let bodyEnd = Math.min(startIdx + fallbackWindow, lines.length);
  const firstLine = lines[startIdx] || '';
  const waitForArrowBody = /(?:const|let)\s+\w+\s*=/.test(firstLine);
  let arrowBodySeen = !waitForArrowBody;

  for (let j = startIdx; j < Math.min(startIdx + scanWindow, lines.length); j++) {
    const line = lines[j] || '';
    let scanFrom = 0;
    if (!arrowBodySeen) {
      const arrowIdx = line.indexOf('=>');
      if (arrowIdx === -1) {
        continue;
      }
      arrowBodySeen = true;
      scanFrom = arrowIdx + 2;
    }

    for (const ch of line.slice(scanFrom)) {
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

  return bodyEnd;
}

/** Calls callback prop. */
export function callsCallbackProp(bodyText: string, fileContent: string): boolean {
  const lines = fileContent.split('\n');
  const callbackCallRe = /\b(on[A-Z]\w*)\s*\(/g;
  let cbMatch;
  while ((cbMatch = callbackCallRe.exec(bodyText)) !== null) {
    const cbName = cbMatch[1];
    if (findFunctionDeclarationIndex(lines, cbName) === -1) {
      return true;
    }
  }

  return false;
}
