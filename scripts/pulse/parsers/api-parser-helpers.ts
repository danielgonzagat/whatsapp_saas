/** Block/context extraction helpers used by api-parser. */

import { findQuotedStringEnd, readTemplateEndpoint } from './api-parser-string-utils';

/**
 * Wrapper and variable names discovered from source must be plain JavaScript
 * identifiers (alphanumeric, underscore, dollar). Dynamic regex construction is
 * intentionally avoided in this file, so scanner output is driven by static
 * patterns plus string equality checks.
 */
const IDENTIFIER_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const DECLARATION_START_RE = /\b(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*/g;
const WRAPPER_CALL_START_RE = /\b(\w+)\s*(?:<[^\n]*>)?\s*\(/g;
const WRAPPER_VARIABLE_CALL_RE = /\b(\w+)\s*(?:<[^\n]*>)?\s*\(\s*(\w+)\b/g;
const MEMBER_CALL_RE = /\b(\w+)\s*\.\s*(\w+)\s*\(/g;
const FUNCTION_CALL_RE = /\b(\w+)\s*\(/g;
import { normalizeEndpoint } from './api-parser-normalize';
import { readTextFile } from '../safe-fs';

function findMethodBodyStart(line: string): number {
  const bodyStart = line.lastIndexOf('{');
  if (bodyStart < 0) {
    return -1;
  }

  const beforeBody = line.slice(0, bodyStart).trim();
  if (/=>\s*$/.test(beforeBody) || /\)\s*(?::[^=]*)?$/.test(beforeBody)) {
    return bodyStart;
  }

  return -1;
}

export function extractMethodBlock(lines: string[], startIndex: number, maxLines = 80): string {
  const block: string[] = [];
  let depth = 0;
  let parenDepth = 0;
  let started = false;
  let expressionMode = false;

  for (let i = startIndex; i < Math.min(startIndex + maxLines, lines.length); i++) {
    const line = lines[i];
    block.push(line);

    let scanFrom = 0;
    if (!started) {
      const bodyStart = findMethodBodyStart(line);
      if (bodyStart < 0) {
        if (/=>/.test(line)) {
          expressionMode = true;
          started = true;
          scanFrom = Math.max(0, line.indexOf('=>') + 2);
        } else {
          continue;
        }
      } else {
        scanFrom = bodyStart;
      }
    }

    if (expressionMode) {
      for (const ch of line.slice(scanFrom)) {
        if (ch === '(' || ch === '[') {
          parenDepth++;
        } else if (ch === ')' || ch === ']') {
          parenDepth--;
        }
      }
      if (started && parenDepth <= 0 && /,\s*$/.test(line.trim())) {
        break;
      }
      continue;
    }

    for (const ch of line.slice(scanFrom)) {
      if (ch === '{') {
        depth++;
        started = true;
      } else if (ch === '}') {
        depth--;
      }
    }

    if (started && depth <= 0) {
      break;
    }
  }

  return block.join('\n');
}

export function extractEndpointVariable(text: string, variableName: string): string | null {
  if (!IDENTIFIER_RE.test(variableName)) {
    return null;
  }
  let declaration: RegExpExecArray | null = null;
  DECLARATION_START_RE.lastIndex = 0;
  let candidate: RegExpExecArray | null;
  while ((candidate = DECLARATION_START_RE.exec(text)) !== null) {
    if (candidate[1] === variableName) {
      declaration = candidate;
      break;
    }
  }
  if (!declaration) {
    return null;
  }

  let index = declaration.index + declaration[0].length;
  while (/\s/.test(text[index] || '')) {
    index++;
  }

  const quote = text[index];
  if (quote !== '`' && quote !== '"' && quote !== "'") {
    return null;
  }

  if (quote !== '`') {
    const end = findQuotedStringEnd(text, index + 1, quote);
    const raw = end > index ? text.slice(index + 1, end) : '';
    return raw.startsWith('/') ? raw : null;
  }

  const raw = readTemplateEndpoint(text, index + 1);
  return raw.startsWith('/') ? raw : null;
}

export function extractWrappedFetchCall(
  text: string,
  wrapperPrefixes: Map<string, string>,
): { endpoint: string; wrapperName: string } | null {
  const callRe = /\b(\w+)\s*(?:<[^\n]*>)?\s*\(\s*(?:['"`]([^'"`]*)['"`]|`([^`]*)`)/g;
  const directMatches = [...text.matchAll(callRe)];
  const directMatch = directMatches.find((match) => wrapperPrefixes.has(match[1])) || null;
  if (directMatch) {
    const wrapperName = directMatch[1];
    const raw = directMatch[2] || directMatch[3] || '';
    const prefix = wrapperPrefixes.get(wrapperName) || '';
    return { endpoint: normalizeEndpoint(`${prefix}${raw}`), wrapperName };
  }

  const conditionalRe =
    /^\b(\w+)\s*(?:<[^\n]*>)?\s*\(\s*[\s\S]*?\?\s*(?:['"`]([^'"`]*)['"`]|`([^`]*)`)\s*:\s*(?:['"`]([^'"`]*)['"`]|`([^`]*)`)/;
  let conditionalMatch: RegExpMatchArray | null = null;
  WRAPPER_CALL_START_RE.lastIndex = 0;
  for (const startMatch of text.matchAll(WRAPPER_CALL_START_RE)) {
    const wrapperName = startMatch[1];
    if (!wrapperPrefixes.has(wrapperName)) {
      continue;
    }
    const startIndex = startMatch.index || 0;
    const match = text.slice(startIndex).match(conditionalRe);
    if (match) {
      conditionalMatch = match;
      break;
    }
  }
  if (conditionalMatch && wrapperPrefixes.has(conditionalMatch[1])) {
    const wrapperName = conditionalMatch[1];
    const raw =
      conditionalMatch[2] ||
      conditionalMatch[3] ||
      conditionalMatch[4] ||
      conditionalMatch[5] ||
      '';
    const prefix = wrapperPrefixes.get(wrapperName) || '';
    return { endpoint: normalizeEndpoint(`${prefix}${raw}`), wrapperName };
  }

  WRAPPER_VARIABLE_CALL_RE.lastIndex = 0;
  let variableCallMatch: RegExpExecArray | null;
  while ((variableCallMatch = WRAPPER_VARIABLE_CALL_RE.exec(text)) !== null) {
    const wrapperName = variableCallMatch[1];
    if (!wrapperPrefixes.has(wrapperName)) {
      continue;
    }
    const raw = extractEndpointVariable(text, variableCallMatch[2]);
    if (!raw) {
      continue;
    }
    const prefix = wrapperPrefixes.get(wrapperName) || '';
    return { endpoint: normalizeEndpoint(`${prefix}${raw}`), wrapperName };
  }

  return null;
}

export function startsWrappedFetchCall(
  line: string,
  wrapperPrefixes: Map<string, string>,
): boolean {
  const match = line.match(/\b(\w+)\s*(?:<[^\n]*>)?\s*\(/);
  return Boolean(match && wrapperPrefixes.has(match[1]));
}

export function extractWrappedCallContext(
  lines: string[],
  startIndex: number,
  wrapperPrefixes: Map<string, string>,
): string {
  const firstLine = lines[startIndex] || '';
  let matchStart = -1;
  WRAPPER_CALL_START_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WRAPPER_CALL_START_RE.exec(firstLine)) !== null) {
    if (wrapperPrefixes.has(match[1]) && (matchStart < 0 || match.index < matchStart)) {
      matchStart = match.index;
    }
  }
  if (matchStart < 0) {
    return lines.slice(startIndex, Math.min(startIndex + 8, lines.length)).join('\n');
  }

  let context = '';
  let parenDepth = 0;
  let started = false;
  for (let i = startIndex; i < Math.min(startIndex + 8, lines.length); i++) {
    const line = lines[i] || '';
    const scanFrom = i === startIndex ? matchStart : 0;
    for (const ch of line.slice(scanFrom)) {
      context += ch;
      if (ch === '(') {
        parenDepth++;
        started = true;
      } else if (ch === ')') {
        parenDepth--;
        if (started && parenDepth <= 0) {
          return context;
        }
      }
    }
    context += '\n';
  }

  return context;
}

export function extractNamedCallContext(
  lines: string[],
  startIndex: number,
  callName: string,
): string {
  const startLine = lines[startIndex] || '';
  const matchStart = startLine.indexOf(callName);
  if (matchStart < 0) {
    return '';
  }

  let context = '';
  let parenDepth = 0;
  let started = false;
  for (let i = startIndex; i < Math.min(startIndex + 30, lines.length); i++) {
    const line = lines[i] || '';
    const scanFrom = i === startIndex ? matchStart : 0;
    for (const ch of line.slice(scanFrom)) {
      context += ch;
      if (ch === '(') {
        parenDepth++;
        started = true;
      } else if (ch === ')') {
        parenDepth--;
        if (started && parenDepth <= 0) {
          return context;
        }
      }
    }
    context += '\n';
  }

  return context;
}

export function extractMappedApiModuleCalls(
  text: string,
  apiModuleMap: Map<string, { endpoint: string; method: string }>,
): Array<{ endpoint: string; method: string }> {
  const matches: Array<{ endpoint: string; method: string }> = [];
  for (const [callName, apiInfo] of apiModuleMap) {
    const [objectName, methodName] = callName.split('.');
    let found = false;
    if (methodName) {
      MEMBER_CALL_RE.lastIndex = 0;
      let callMatch: RegExpExecArray | null;
      while ((callMatch = MEMBER_CALL_RE.exec(text)) !== null) {
        if (callMatch[1] === objectName && callMatch[2] === methodName) {
          found = true;
          break;
        }
      }
    } else {
      FUNCTION_CALL_RE.lastIndex = 0;
      let callMatch: RegExpExecArray | null;
      while ((callMatch = FUNCTION_CALL_RE.exec(text)) !== null) {
        if (callMatch[1] === callName) {
          found = true;
          break;
        }
      }
    }
    if (found) {
      matches.push(apiInfo);
    }
  }
  return matches;
}

export function buildFetchWrapperPrefixMap(files: string[]): Map<string, string> {
  const wrapperPrefixes = new Map<string, string>([['apiFetch', '']]);

  for (const file of files) {
    const content = readTextFile(file, 'utf8');
    const exportedWrapperMatches = [
      ...content.matchAll(/export\s+async\s+function\s+(\w*Fetch)\b/g),
    ];
    if (exportedWrapperMatches.length === 0) {
      continue;
    }

    const apiUrlMatch = content.match(
      /(?:const|let)\s+\w*API\w*URL\w*\s*=\s*[\s\S]*?['"`](https?:\/\/[^'"`]+|\/[^'"`]+)['"`]/,
    );
    const prefix = apiUrlMatch ? parseUrlPathLocal(apiUrlMatch[1]) : '';

    for (const match of exportedWrapperMatches) {
      const wrapperName = match[1];
      wrapperPrefixes.set(wrapperName, wrapperName === 'apiFetch' ? '' : prefix);
    }
  }

  return wrapperPrefixes;
}

function parseUrlPathLocal(value: string): string {
  try {
    if (/^https?:\/\//i.test(value)) {
      return new URL(value).pathname.replace(/\/$/, '');
    }
  } catch {
    return '';
  }
  return value.startsWith('/') ? value.replace(/\/$/, '') : '';
}

export function findWrapperTemplatePrefix(content: string, wrapperName: string): string {
  const start = content.indexOf(`function ${wrapperName}`);
  if (start < 0) {
    return '';
  }
  const bodyWindow = content.slice(start, start + 1500);
  const wrapperDef = bodyWindow.match(/apiFetch[^(]*\(\s*`([^$`]*?)\$\{/);
  return wrapperDef ? wrapperDef[1] : '';
}
