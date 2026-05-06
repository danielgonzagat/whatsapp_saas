import type { HookRegistry } from './hook-registry';

/**
 * Branchless whitespace check that does not allocate a regex per call.
 * Replaces the previous `/\s/.test(...)` loop guard which Codacy flagged for
 * a (false-positive) ReDoS pattern.
 */
function isWhitespaceChar(c: string | undefined): boolean {
  if (!c) return false;
  // Spec: whitespace chars per WhiteSpace + LineTerminator productions.
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
}

const IDENTIFIER_RE = '[A-Za-z_$][A-Za-z0-9_$]*';
const FUNCTION_DECLARATION_RE = new RegExp(
  `^\\s*(?:export\\s+)?(?:async\\s+)?function\\s+(${IDENTIFIER_RE})\\b`,
);
const VARIABLE_FUNCTION_RE = new RegExp(
  `^\\s*(?:export\\s+)?(?:const|let)\\s+(${IDENTIFIER_RE})\\s*=\\s*(?:(?:async\\s+)?(?:\\([^)]*\\)|${IDENTIFIER_RE})\\s*=>|(?:async\\s+)?function\\b)`,
);

/** Component has save handler. */
export function componentHasSaveHandler(fileContent: string): boolean {
  const lines = fileContent.split('\n');
  for (const { startIdx } of discoverFunctionDeclarations(lines)) {
    const bodyEnd = findFunctionBodyEnd(lines, startIdx, 60, 40);
    if (hasApiCall(lines.slice(startIdx, bodyEnd).join('\n'))) {
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
      while (cursor < text.length && isWhitespaceChar(text[cursor])) {
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
      while (cursor < text.length && isWhitespaceChar(text[cursor])) {
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

function discoverFunctionDeclarations(lines: string[]): Array<{ name: string; startIdx: number }> {
  return lines.flatMap((line, startIdx) => {
    const match = line.match(FUNCTION_DECLARATION_RE) || line.match(VARIABLE_FUNCTION_RE);
    if (!match) {
      return [];
    }
    return [{ name: match[1], startIdx }];
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

    if (hookFuncs?.get(funcName)?.endpoint) {
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
  const functionCallRe = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  const calledFunctions = new Set<string>();
  let functionCallMatch: RegExpExecArray | null;
  while ((functionCallMatch = functionCallRe.exec(bodyText)) !== null) {
    calledFunctions.add(functionCallMatch[1]);
  }

  for (const [localName, { hookName, funcName }] of hookDestructures) {
    if (!calledFunctions.has(localName)) {
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
  return hasEndpointCallEvidence(text) || hasApiNamedCallEvidence(text);
}

function hasEndpointCallEvidence(text: string): boolean {
  const endpointCallRe = /\(\s*(?:['"`]\/api\/[^'"`]*['"`]|`\$\{[^}]+\}\/api\/[^`]*`)/g;
  return endpointCallRe.test(text);
}

function hasApiNamedCallEvidence(text: string): boolean {
  const callRe = new RegExp(`\\b(${IDENTIFIER_RE})(?:\\s*\\.\\s*(${IDENTIFIER_RE}))?\\s*\\(`, 'g');
  let match: RegExpExecArray | null;
  while ((match = callRe.exec(text)) !== null) {
    const symbolText = [match[1], match[2]].filter(Boolean).join('.');
    if (symbolText.toLowerCase().includes('api')) {
      return true;
    }
  }
  return false;
}

/** Has browser navigation effect. */
export function hasBrowserNavigationEffect(text: string): boolean {
  return (
    hasMemberAction(text, 'router', 'push') ||
    hasMemberAction(text, 'router', 'replace') ||
    hasMemberAction(text, 'window', 'open') ||
    hasMemberAction(text, 'navigator', 'clipboard') ||
    hasMemberAction(text, 'window', 'location')
  );
}

function hasMemberAction(text: string, objectName: string, memberName: string): boolean {
  let offset = text.indexOf(objectName);
  while (offset !== -1) {
    if (hasIdentifierAt(text, offset, objectName)) {
      let cursor = offset + objectName.length;
      while (cursor < text.length && isWhitespaceChar(text[cursor])) {
        cursor += 1;
      }
      if (text[cursor] === '.') {
        cursor += 1;
        while (cursor < text.length && isWhitespaceChar(text[cursor])) {
          cursor += 1;
        }
        if (hasIdentifierAt(text, cursor, memberName)) {
          return true;
        }
      }
    }
    offset = text.indexOf(objectName, offset + objectName.length);
  }
  return false;
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
