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

export function hasApiCall(text: string): boolean {
  return API_CALL_PATTERNS.some((p) => p.test(text));
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
