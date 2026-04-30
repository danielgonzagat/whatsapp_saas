import * as path from 'path';
import * as ts from 'typescript';
import type { UIElement, PulseConfig } from '../types';
import type { HookRegistry } from './hook-registry';
import { buildApiModuleMap } from './api-parser';
import { extractSaveHandlerApiCalls } from '../ui-api-calls';
import { componentHasSaveHandler, resolveHandler } from './ui-handler-resolver';
import { extractHookDestructures } from './hook-registry';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';
import { getFrontendSourceDirs } from '../frontend-roots';

function extractLabel(line: string, lines: string[], idx: number): string {
  // Try to find visible text on same line
  const text = extractBetween(line, '>', '<');
  if (text && text.length <= 60) {
    return text.trim();
  }

  for (const attrName of ['label', 'aria-label', 'title', 'placeholder']) {
    const attrValue = extractQuotedAttribute(line, attrName);
    if (attrValue && attrValue.length <= 60) {
      return attrValue;
    }
  }

  // Check next 3 lines for text content
  for (let j = 1; j <= 3 && idx + j < lines.length; j++) {
    const nextLine = lines[idx + j].trim();
    // Skip lines that look like CSS/style properties
    if (looksLikeStyleProperty(nextLine)) {
      continue;
    }
    if (nextLine.startsWith('...')) {
      continue;
    }
    // Direct text content (not a tag or expression)
    const nextText = readLeadingText(nextLine, 60);
    if (
      nextText &&
      !nextText.includes('=') &&
      !nextText.includes('{') &&
      !nextText.startsWith('//')
    ) {
      return nextText.trim();
    }
    // Text inside a tag
    const insideTag = extractBetween(nextLine, '>', '<');
    if (insideTag && insideTag.length <= 60) {
      return insideTag.trim();
    }
  }

  return '(sem texto)';
}

function extractComponent(lines: string[], idx: number): string | null {
  for (let i = idx; i >= Math.max(0, idx - 200); i--) {
    const componentName = readComponentDeclarationName(lines[i]);
    if (componentName && startsWithUppercase(componentName)) {
      return componentName;
    }
  }
  return null;
}

function extractBetween(line: string, open: string, close: string): string | null {
  const start = line.indexOf(open);
  if (start < 0) {
    return null;
  }
  const end = line.indexOf(close, start + open.length);
  if (end < 0) {
    return null;
  }
  return line.slice(start + open.length, end);
}

function extractQuotedAttribute(line: string, attrName: string): string | null {
  const attrIndex = line.indexOf(attrName);
  if (attrIndex < 0) {
    return null;
  }
  let cursor = attrIndex + attrName.length;
  while (line[cursor] === ' ' || line[cursor] === '\t') cursor += 1;
  if (line[cursor] !== '=') return null;
  cursor += 1;
  while (line[cursor] === ' ' || line[cursor] === '\t') cursor += 1;
  const quote = line[cursor];
  if (quote !== '"' && quote !== "'" && quote !== '`') return null;
  cursor += 1;
  const start = cursor;
  while (cursor < line.length && line[cursor] !== quote) cursor += 1;
  return cursor > start ? line.slice(start, cursor) : null;
}

function looksLikeStyleProperty(line: string): boolean {
  const property = readLeadingIdentifier(line);
  if (!property) return false;
  const afterProperty = line.slice(property.length).trimStart();
  return (
    [
      'background',
      'display',
      'width',
      'height',
      'position',
      'border',
      'color',
      'font',
      'padding',
      'margin',
      'flex',
      'align',
      'justify',
      'cursor',
      'opacity',
      'transform',
      'transition',
      'overflow',
      'gap',
      'aspect',
      'grid',
      'z-index',
      'top',
      'left',
      'right',
      'bottom',
    ].includes(property.toLowerCase()) &&
    (afterProperty.startsWith(':') || afterProperty.startsWith('='))
  );
}

function readLeadingText(line: string, max: number): string | null {
  if (!line || line[0] === '<' || line[0] === '{' || line[0] === '>' || line[0].trim() === '') {
    return null;
  }
  const boundary = line.indexOf('<');
  const text = line.slice(0, boundary < 0 ? Math.min(line.length, max) : Math.min(boundary, max));
  return text.trim() ? text : null;
}

function readLeadingIdentifier(line: string): string {
  let output = '';
  for (const char of line.trimStart()) {
    const lower = char.toLowerCase();
    const isLetter = lower >= 'a' && lower <= 'z';
    if (isLetter || char === '-') {
      output += char;
      continue;
    }
    break;
  }
  return output;
}

function readComponentDeclarationName(line: string): string | null {
  const tokens = splitWhitespaceTokens(line);
  const functionIndex = tokens.indexOf('function');
  if (functionIndex >= 0) {
    return stripIdentifierToken(tokens[functionIndex + 1] ?? '');
  }
  const constIndex = tokens.indexOf('const');
  if (constIndex >= 0) {
    return stripIdentifierToken(tokens[constIndex + 1] ?? '');
  }
  return null;
}

function stripIdentifierToken(value: string): string {
  let output = '';
  for (const char of value) {
    const lower = char.toLowerCase();
    const isLetter = lower >= 'a' && lower <= 'z';
    const isDigit = char >= '0' && char <= '9';
    if (isLetter || isDigit || char === '_') {
      output += char;
      continue;
    }
    break;
  }
  return output;
}

function startsWithUppercase(value: string): boolean {
  return value.length > 0 && value[0] >= 'A' && value[0] <= 'Z';
}

function splitWhitespaceTokens(value: string): string[] {
  const tokens: string[] = [];
  let token = '';
  for (const char of value) {
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      if (token) {
        tokens.push(token);
        token = '';
      }
      continue;
    }
    token += char;
  }
  if (token) {
    tokens.push(token);
  }
  return tokens;
}

function buildHandlerEvidence(
  handler: string | null,
  resolved: { type: UIElement['handlerType']; apiCalls: string[] },
): Pick<UIElement, 'handlerEvidence' | 'handlerPredicates'> {
  const evidence = new Set<string>();
  const predicates = new Set<string>();
  if (!handler || handler.trim().length === 0) {
    predicates.add('handler:missing');
  } else {
    predicates.add('handler:present');
  }
  predicates.add(`handler:${resolved.type}`);
  if (resolved.apiCalls.length > 0) {
    predicates.add('api_call:observed');
    for (const apiCall of resolved.apiCalls) {
      evidence.add(`api_call:${apiCall}`);
    }
  }
  if (handler?.includes('=>')) {
    predicates.add('handler:inline');
  }
  return {
    handlerEvidence: [...evidence],
    handlerPredicates: [...predicates],
  };
}

/**
 * Extract a JSX handler expression using brace-counting.
 * Given a line like: onClick={handleSave} style={{display: "flex"}}
 * Returns just "handleSave" — stops at the matching closing brace.
 *
 * Handles nested braces: onClick={() => { doSomething() }}
 */
function findJSXHandlerStart(line: string, eventName: string): number {
  let searchFrom = 0;
  while (searchFrom < line.length) {
    const eventIndex = line.indexOf(eventName, searchFrom);
    if (eventIndex < 0) {
      return -1;
    }

    let cursor = eventIndex + eventName.length;
    while (line[cursor] === ' ' || line[cursor] === '\t') {
      cursor++;
    }
    if (line[cursor] !== '=') {
      searchFrom = cursor;
      continue;
    }

    cursor++;
    while (line[cursor] === ' ' || line[cursor] === '\t') {
      cursor++;
    }
    if (line[cursor] === '{') {
      return cursor + 1;
    }
    searchFrom = cursor;
  }
  return -1;
}

function extractJSXHandler(line: string, eventName: string): string | null {
  const start = findJSXHandlerStart(line, eventName);
  if (start < 0) {
    return null;
  }

  let depth = 1;
  let i = start;

  while (i < line.length && depth > 0) {
    const ch = line[i];
    // Skip string literals
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < line.length && line[i] !== quote) {
        if (line[i] === '\\') {
          i++;
        } // skip escaped char
        i++;
      }
    } else if (ch === '{') {
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        return line.substring(start, i).trim();
      }
    }
    i++;
  }

  // If we didn't find closing brace on this line, return what we have
  if (depth > 0 && start < line.length) {
    // Likely a multi-line handler — return what's on this line
    return line.substring(start).trim();
  }

  return null;
}

function expandInlineHandler(handler: string, lines: string[], idx: number): string {
  if (handler.trimEnd().endsWith('=>')) {
    const expanded = [handler];
    for (let j = idx + 1; j < Math.min(idx + 20, lines.length); j++) {
      expanded.push(lines[j]);
      if (isClosingBlockLine(lines[j])) {
        break;
      }
    }
    return expanded.join('\n');
  }

  if (!handler.includes('=>') || !handler.includes('{') || handler.includes('}')) {
    return handler;
  }

  let depth = 0;
  for (const ch of handler) {
    if (ch === '{') {
      depth++;
    }
    if (ch === '}') {
      depth--;
    }
  }

  if (depth <= 0) {
    return handler;
  }

  const expanded = [handler];
  for (let j = idx + 1; j < Math.min(idx + 30, lines.length); j++) {
    expanded.push(lines[j]);
    for (const ch of lines[j]) {
      if (ch === '{') {
        depth++;
      }
      if (ch === '}') {
        depth--;
      }
    }
    if (depth <= 0) {
      break;
    }
  }

  return expanded.join('\n');
}

function isClosingBlockLine(line: string): boolean {
  const trimmed = line.trimStart();
  if (!trimmed.startsWith('}')) {
    return false;
  }
  const afterBlock = trimmed.slice(1).trimStart();
  return afterBlock.length === 0 || afterBlock.startsWith(')') || afterBlock.startsWith(',');
}

const DOM_HANDLER_PROPS = new Set([
  'onBlur',
  'onChange',
  'onClick',
  'onFocus',
  'onInput',
  'onKeyDown',
  'onKeyUp',
  'onMouseDown',
  'onMouseEnter',
  'onMouseLeave',
  'onMouseUp',
  'onPointerDown',
  'onPointerEnter',
  'onPointerLeave',
  'onPointerUp',
  'onSubmit',
]);

/**
 * Extract names imported from @/lib/api (functions that make API calls)
 */
function extractApiImports(fileContent: string): Set<string> {
  const imports = new Set<string>();
  const sourceFile = ts.createSourceFile('ui.tsx', fileContent, ts.ScriptTarget.Latest, true);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (!isApiModuleSpecifier(statement.moduleSpecifier.text)) {
      continue;
    }
    const bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) {
      continue;
    }
    for (const element of bindings.elements) {
      if (!element.isTypeOnly) {
        imports.add(element.name.text);
      }
    }
  }
  return imports;
}

function isApiModuleSpecifier(value: string): boolean {
  const normalized = value.split(path.sep).join('/');
  return normalized.includes('/lib/api') || normalized.startsWith('@/lib/api');
}

function isTestOrSpecFile(filePath: string): boolean {
  const baseName = path.basename(filePath);
  const segments = baseName.split('.');
  return segments.includes('test') || segments.includes('spec');
}

function readJsxTagName(line: string): string | null {
  const tagStart = line.indexOf('<');
  if (tagStart < 0 || line[tagStart + 1] === '/') {
    return null;
  }
  let cursor = tagStart + 1;
  let tagName = '';
  while (cursor < line.length) {
    const char = line[cursor];
    const lower = char.toLowerCase();
    const isLetter = lower >= 'a' && lower <= 'z';
    const isDigit = char >= '0' && char <= '9';
    if (isLetter || isDigit || char === '.' || char === '_') {
      tagName += char;
      cursor += 1;
      continue;
    }
    break;
  }
  return tagName || null;
}

function hasButtonSemantics(line: string): boolean {
  const tagName = readJsxTagName(line);
  if (!tagName) {
    return false;
  }
  const lowerTag = tagName.toLowerCase();
  return lowerTag === 'button' || lowerTag.endsWith('button') || lowerTag.endsWith('bt');
}

function extractActionPropNames(line: string): string[] {
  const props: string[] = [];
  let cursor = 0;
  while (cursor < line.length) {
    const onIndex = line.indexOf('on', cursor);
    if (onIndex < 0) {
      break;
    }
    const next = line[onIndex + 2] ?? '';
    if (next < 'A' || next > 'Z') {
      cursor = onIndex + 2;
      continue;
    }
    let end = onIndex + 3;
    while (end < line.length) {
      const char = line[end];
      const lower = char.toLowerCase();
      const isLetter = lower >= 'a' && lower <= 'z';
      const isDigit = char >= '0' && char <= '9';
      if (isLetter || isDigit || char === '_') {
        end += 1;
        continue;
      }
      break;
    }
    let afterName = end;
    while (line[afterName] === ' ' || line[afterName] === '\t') afterName += 1;
    if (line[afterName] !== '=') {
      cursor = end;
      continue;
    }
    afterName += 1;
    while (line[afterName] === ' ' || line[afterName] === '\t') afterName += 1;
    if (line[afterName] === '{') {
      props.push(line.slice(onIndex, end));
    }
    cursor = end;
  }
  return props;
}

function hasToggleSemantics(line: string): boolean {
  const tagName = readJsxTagName(line);
  if (!tagName) {
    return false;
  }
  const lowerTag = tagName.toLowerCase();
  return lowerTag.includes('toggle') || lowerTag.includes('switch') || lowerTag.endsWith('tg');
}

function resolveToggleHandler(line: string): string | null {
  return extractJSXHandler(line, 'onChange') || extractJSXHandler(line, 'onClick');
}

function buildElement(
  relFile: string,
  lineNumber: number,
  elementType: UIElement['type'],
  label: string,
  handler: string,
  resolved: { type: UIElement['handlerType']; apiCalls: string[] },
  component: string | null,
): UIElement {
  return {
    file: relFile,
    line: lineNumber,
    type: elementType,
    label,
    handler,
    handlerType: resolved.type,
    apiCalls: resolved.apiCalls,
    ...buildHandlerEvidence(handler, resolved),
    component,
  };
}
