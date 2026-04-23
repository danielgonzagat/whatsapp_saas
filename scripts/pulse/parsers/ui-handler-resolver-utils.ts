import type { HookRegistry } from './hook-registry';

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

export function componentHasSaveHandler(fileContent: string): boolean {
  for (const name of SAVE_HANDLER_NAMES) {
    const funcRe = new RegExp(`(?:const|function|async function)\\s+${name}\\s*(?:=|\\()`, 'g');
    const match = funcRe.exec(fileContent);
    if (!match) {
      continue;
    }

    const startIdx = fileContent.substring(0, match.index).split('\n').length - 1;
    const lines = fileContent.split('\n');
    const bodyText = lines.slice(startIdx, Math.min(startIdx + 40, lines.length)).join('\n');

    if (hasApiCall(bodyText)) {
      return true;
    }
  }

  return false;
}

export function bodyCallsHookFunction(
  bodyText: string,
  hookDestructures: Map<string, { hookName: string; funcName: string }>,
  hookRegistry: HookRegistry,
): boolean {
  for (const [localName, { hookName, funcName }] of hookDestructures) {
    const callRe = new RegExp(`\\b${localName}\\s*\\(`, 'g');
    if (!callRe.test(bodyText)) {
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

export function hasApiCall(text: string): boolean {
  return API_CALL_PATTERNS.some((p) => p.test(text));
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function findFunctionBodyEnd(
  lines: string[],
  startIdx: number,
  scanWindow: number,
  fallbackWindow: number,
): number {
  let depth = 0;
  let bodyStarted = false;
  let bodyEnd = Math.min(startIdx + fallbackWindow, lines.length);

  for (let j = startIdx; j < Math.min(startIdx + scanWindow, lines.length); j++) {
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

  return bodyEnd;
}

export function callsCallbackProp(bodyText: string, fileContent: string): boolean {
  const callbackCallRe = /\b(on[A-Z]\w*)\s*\(/g;
  let cbMatch;
  while ((cbMatch = callbackCallRe.exec(bodyText)) !== null) {
    const cbName = cbMatch[1];
    const cbDefRe = new RegExp(`(?:const|let|function|async function)\\s+${cbName}\\s*(?:=|\\()`);
    if (!cbDefRe.test(fileContent)) {
      return true;
    }
  }

  return false;
}
