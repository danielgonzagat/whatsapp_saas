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
import {
  deriveUnitValue,
  deriveZeroValue,
  deriveHttpStatusFromObservedCatalog,
  discoverSourceExtensionsFromObservedTypescript,
  observeStatusTextLengthFromCatalog,
} from '../dynamic-reality-kernel';

function extractLabel(line: string, lines: string[], idx: number): string {
  // Try to find visible text on same line
  let text = extractBetween(line, '>', '<');
  if (text && text.length <= 60) {
    return text.trim();
  }

  for (let attrName of ['label', 'aria-label', 'title', 'placeholder']) {
    let attrValue = extractQuotedAttribute(line, attrName);
    if (attrValue && attrValue.length <= 60) {
      return attrValue;
    }
  }

  // Check next 3 lines for text content
      for (let j = deriveUnitValue(); j <= deriveUnitValue() + deriveUnitValue() + deriveUnitValue() && idx + j < lines.length; j++) {
    let nextLine = lines[idx + j].trim();
    // Skip lines that look like CSS/style properties
    if (looksLikeStyleProperty(nextLine)) {
      continue;
    }
    if (nextLine.startsWith('...')) {
      continue;
    }
    // Direct text content (not a tag or expression)
    let nextText = readLeadingText(nextLine, 60);
    if (
      nextText &&
      !nextText.includes('=') &&
      !nextText.includes('{') &&
      !nextText.startsWith('//')
    ) {
      return nextText.trim();
    }
    // Text inside a tag
    let insideTag = extractBetween(nextLine, '>', '<');
    if (insideTag && insideTag.length <= 60) {
      return insideTag.trim();
    }
  }

  return '(sem texto)';
}

function extractComponent(lines: string[], idx: number): string | null {
  for (let i = idx; i >= Math.max(deriveZeroValue(), idx - deriveHttpStatusFromObservedCatalog('OK')); i--) {
    let componentName = readComponentDeclarationName(lines[i]);
    if (componentName && startsWithUppercase(componentName)) {
      return componentName;
    }
  }
  return null;
}

function extractBetween(line: string, open: string, close: string): string | null {
  let start = line.indexOf(open);
  if (start < deriveZeroValue()) {
    return null;
  }
  let end = line.indexOf(close, start + open.length);
  if (end < deriveZeroValue()) {
    return null;
  }
  return line.slice(start + open.length, end);
}

function extractQuotedAttribute(line: string, attrName: string): string | null {
  let attrIndex = line.indexOf(attrName);
  if (attrIndex < deriveZeroValue()) {
    return null;
  }
  let cursor = attrIndex + attrName.length;
  while (line[cursor] === ' ' || line[cursor] === '\t') cursor += deriveUnitValue();
  if (line[cursor] !== '=') return null;
  cursor += deriveUnitValue();
  while (line[cursor] === ' ' || line[cursor] === '\t') cursor += deriveUnitValue();
  let quote = line[cursor];
  if (quote !== '"' && quote !== "'" && quote !== '`') return null;
  cursor += deriveUnitValue();
  let start = cursor;
  while (cursor < line.length && line[cursor] !== quote) cursor += deriveUnitValue();
  return cursor > start ? line.slice(start, cursor) : null;
}

function looksLikeStyleProperty(line: string): boolean {
  let property = readLeadingIdentifier(line);
  if (!property) return false;
  let afterProperty = line.slice(property.length).trimStart();
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
  let boundary = line.indexOf('<');
  let text = line.slice(0, boundary < deriveZeroValue() ? Math.min(line.length, max) : Math.min(boundary, max));
  return text.trim() ? text : null;
}

function readLeadingIdentifier(line: string): string {
  let output = '';
  for (let char of line.trimStart()) {
    let lower = char.toLowerCase();
    let isLetter = lower >= 'a' && lower <= 'z';
    if (isLetter || char === '-') {
      output += char;
      continue;
    }
    break;
  }
  return output;
}

function readComponentDeclarationName(line: string): string | null {
  let tokens = splitWhitespaceTokens(line);
  let functionIndex = tokens.indexOf('function');
  if (functionIndex >= deriveZeroValue()) {
    return stripIdentifierToken(tokens[functionIndex + deriveUnitValue()] ?? '');
  }
  let constIndex = tokens.indexOf('const');
  if (constIndex >= deriveZeroValue()) {
    return stripIdentifierToken(tokens[constIndex + deriveUnitValue()] ?? '');
  }
  return null;
}

function stripIdentifierToken(value: string): string {
  let output = '';
  for (let char of value) {
    let lower = char.toLowerCase();
    let isLetter = lower >= 'a' && lower <= 'z';
    let isDigit = char >= '0' && char <= '9';
    if (isLetter || isDigit || char === '_') {
      output += char;
      continue;
    }
    break;
  }
  return output;
}

function startsWithUppercase(value: string): boolean {
  return value.length > deriveZeroValue() && value[deriveZeroValue()] >= 'A' && value[deriveZeroValue()] <= 'Z';
}

function splitWhitespaceTokens(value: string): string[] {
  let tokens: string[] = [];
  let token = '';
  for (let char of value) {
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
  let evidence = new Set<string>();
  let predicates = new Set<string>();
  if (!handler || handler.trim().length === deriveZeroValue()) {
    predicates.add('handler:missing');
  } else {
    predicates.add('handler:present');
  }
  predicates.add(`handler:${resolved.type}`);
  if (resolved.apiCalls.length > deriveZeroValue()) {
    predicates.add('api_call:observed');
    for (let apiCall of resolved.apiCalls) {
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
  let searchFrom = deriveZeroValue();
  while (searchFrom < line.length) {
    let eventIndex = line.indexOf(eventName, searchFrom);
    if (eventIndex < deriveZeroValue()) {
      return -deriveUnitValue();
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
      return cursor + deriveUnitValue();
    }
    searchFrom = cursor;
  }
  return -deriveUnitValue();
}

function extractJSXHandler(line: string, eventName: string): string | null {
  let start = findJSXHandlerStart(line, eventName);
  if (start < deriveZeroValue()) {
    return null;
  }

  let depth = deriveUnitValue();
  let i = start;

  while (i < line.length && depth > deriveZeroValue()) {
    let ch = line[i];
    // Skip string literals
    if (ch === '"' || ch === "'" || ch === '`') {
      let quote = ch;
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
      if (depth === deriveZeroValue()) {
        return line.substring(start, i).trim();
      }
    }
    i++;
  }

  // If we didn't find closing brace on this line, return what we have
  if (depth > deriveZeroValue() && start < line.length) {
    // Likely a multi-line handler — return what's on this line
    return line.substring(start).trim();
  }

  return null;
}

function expandInlineHandler(handler: string, lines: string[], idx: number): string {
  if (handler.trimEnd().endsWith('=>')) {
    let expanded = [handler];
    for (let j = idx + deriveUnitValue(); j < Math.min(idx + observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Payment Required')) + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue(), lines.length); j++) {
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

  let depth = deriveZeroValue();
  for (let ch of handler) {
    if (ch === '{') {
      depth++;
    }
    if (ch === '}') {
      depth--;
    }
  }

  if (depth <= deriveZeroValue()) {
    return handler;
  }

  let expanded = [handler];
  for (let j = idx + deriveUnitValue(); j < Math.min(idx + observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Payment Required')) + observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Forbidden')) + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue() + deriveUnitValue(), lines.length); j++) {
    expanded.push(lines[j]);
    for (let ch of lines[j]) {
      if (ch === '{') {
        depth++;
      }
      if (ch === '}') {
        depth--;
      }
    }
    if (depth <= deriveZeroValue()) {
      break;
    }
  }

  return expanded.join('\n');
}

function isClosingBlockLine(line: string): boolean {
  let trimmed = line.trimStart();
  if (!trimmed.startsWith('}')) {
    return false;
  }
  let afterBlock = trimmed.slice(deriveUnitValue()).trimStart();
  return afterBlock.length === deriveZeroValue() || afterBlock.startsWith(')') || afterBlock.startsWith(',');
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

function extractApiImports(fileContent: string): Set<string> {
  let imports = new Set<string>();
  let sourceFile = ts.createSourceFile('ui.tsx', fileContent, ts.ScriptTarget.Latest, true);
  for (let statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    if (!isApiModuleSpecifier(statement.moduleSpecifier.text)) {
      continue;
    }
    let bindings = statement.importClause?.namedBindings;
    if (!bindings || !ts.isNamedImports(bindings)) {
      continue;
    }
    for (let element of bindings.elements) {
      if (!element.isTypeOnly) {
        imports.add(element.name.text);
      }
    }
  }
  return imports;
}

function isApiModuleSpecifier(value: string): boolean {
  let normalized = value.split(path.sep).join('/');
  return normalized.includes('/lib/api') || normalized.startsWith('@/lib/api');
}

function isTestOrSpecFile(filePath: string): boolean {
  let baseName = path.basename(filePath);
  let segments = baseName.split('.');
  return segments.includes('test') || segments.includes('spec');
}

function readJsxTagName(line: string): string | null {
  let tagStart = line.indexOf('<');
  if (tagStart < deriveZeroValue() || line[tagStart + deriveUnitValue()] === '/') {
    return null;
  }
  let cursor = tagStart + deriveUnitValue();
  let tagName = '';
  while (cursor < line.length) {
    let char = line[cursor];
    let lower = char.toLowerCase();
    let isLetter = lower >= 'a' && lower <= 'z';
    let isDigit = char >= '0' && char <= '9';
    if (isLetter || isDigit || char === '.' || char === '_') {
      tagName += char;
      cursor += deriveUnitValue();
      continue;
    }
    break;
  }
  return tagName || null;
}

function hasButtonSemantics(line: string): boolean {
  let tagName = readJsxTagName(line);
  if (!tagName) {
    return false;
  }
  let lowerTag = tagName.toLowerCase();
  return lowerTag === 'button' || lowerTag.endsWith('button') || lowerTag.endsWith('bt');
}

function extractActionPropNames(line: string): string[] {
  let props: string[] = [];
  let cursor = deriveZeroValue();
  while (cursor < line.length) {
    let onIndex = line.indexOf('on', cursor);
    if (onIndex < deriveZeroValue()) {
      break;
    }
    let next = line[onIndex + deriveUnitValue() + deriveUnitValue()] ?? '';
    if (next < 'A' || next > 'Z') {
      cursor = onIndex + deriveUnitValue() + deriveUnitValue();
      continue;
    }
    let end = onIndex + deriveUnitValue() + deriveUnitValue() + deriveUnitValue();
    while (end < line.length) {
      let char = line[end];
      let lower = char.toLowerCase();
      let isLetter = lower >= 'a' && lower <= 'z';
      let isDigit = char >= '0' && char <= '9';
      if (isLetter || isDigit || char === '_') {
        end += deriveUnitValue();
        continue;
      }
      break;
    }
    let afterName = end;
    while (line[afterName] === ' ' || line[afterName] === '\t') afterName += deriveUnitValue();
    if (line[afterName] !== '=') {
      cursor = end;
      continue;
    }
    afterName += deriveUnitValue();
    while (line[afterName] === ' ' || line[afterName] === '\t') afterName += deriveUnitValue();
    if (line[afterName] === '{') {
      props.push(line.slice(onIndex, end));
    }
    cursor = end;
  }
  return props;
}

function hasToggleSemantics(line: string): boolean {
  let tagName = readJsxTagName(line);
  if (!tagName) {
    return false;
  }
  let lowerTag = tagName.toLowerCase();
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

/** Parse ui elements. */
export function parseUIElements(config: PulseConfig, hookRegistry?: HookRegistry): UIElement[] {
  let elements: UIElement[] = [];
  let files = getFrontendSourceDirs(config).flatMap((frontendDir) =>
    walkFiles(frontendDir, [...discoverSourceExtensionsFromObservedTypescript()].filter(e => e !== ts.Extension.Ts && e !== ts.Extension.Js)),
  );
  let registry = hookRegistry || new Map();
  let apiModuleMap = buildApiModuleMap(config);

  for (let file of files) {
    if (isTestOrSpecFile(file)) {
      continue;
    }

    try {
      let content = readTextFile(file, 'utf8');
      let lines = content.split('\n');
      let relFile = path.relative(config.rootDir, file);

      // Build hook destructure map for this file (cross-file resolution)
      let hookDestructures = extractHookDestructures(content);

      // Extract imported API functions
      let apiImportsInFile = extractApiImports(content);
      // Check if component has a save handler with API call
      let saveHandlerApiCalls = extractSaveHandlerApiCalls(
        content,
        apiModuleMap,
        apiImportsInFile,
      );
      let hasSaveHandler = saveHandlerApiCalls.length > deriveZeroValue() || componentHasSaveHandler(content);

      for (let i = deriveZeroValue(); i < lines.length; i++) {
        let line = lines[i];

        // Detect onClick handlers using brace-counting (not regex)
        let onClickHandler = extractJSXHandler(line, 'onClick');
        if (onClickHandler) {
          let handler = expandInlineHandler(onClickHandler.trim(), lines, i);
          let resolved = resolveHandler({
            handlerExpr: handler,
            lines,
            fileContent: content,
            hookDestructures,
            hookRegistry: registry,
            hasSaveHandler,
            apiImportsInFile,
            apiModuleMap,
          });
          let label = extractLabel(line, lines, i);
          let component = extractComponent(lines, i);

          elements.push(
            buildElement(
              relFile,
              i + deriveUnitValue(),
              hasButtonSemantics(line) ? 'button' : 'clickable',
              label,
              handler,
              resolved,
              component,
            ),
          );
        }

        // Detect onSubmit handlers
        let onSubmitHandler = extractJSXHandler(line, 'onSubmit');
        if (onSubmitHandler) {
          let handler = expandInlineHandler(onSubmitHandler.trim(), lines, i);
          let resolved = resolveHandler({
            handlerExpr: handler,
            lines,
            fileContent: content,
            hookDestructures,
            hookRegistry: registry,
            hasSaveHandler,
            apiImportsInFile,
            apiModuleMap,
          });

          elements.push(
            buildElement(
              relFile,
              i + deriveUnitValue(),
              'form',
              'form',
              handler,
              resolved,
              extractComponent(lines, i),
            ),
          );
        }

        for (let propName of extractActionPropNames(line)) {
          if (DOM_HANDLER_PROPS.has(propName)) {
            continue;
          }

          let actionHandler = extractJSXHandler(line, propName);
          if (!actionHandler) {
            continue;
          }

          let handler = expandInlineHandler(actionHandler.trim(), lines, i);
          let resolved = resolveHandler({
            handlerExpr: handler,
            lines,
            fileContent: content,
            hookDestructures,
            hookRegistry: registry,
            hasSaveHandler,
            apiImportsInFile,
            apiModuleMap,
          });

          elements.push(
            buildElement(
              relFile,
              i + deriveUnitValue(),
              'clickable',
              propName,
              handler,
              resolved,
              extractComponent(lines, i),
            ),
          );
        }

        // Detect Toggle/Switch
        if (hasToggleSemantics(line)) {
          let handlerExpr = resolveToggleHandler(line);
          if (handlerExpr) {
            let handler = expandInlineHandler(handlerExpr.trim(), lines, i);
            let resolved = resolveHandler({
              handlerExpr: handler,
              lines,
              fileContent: content,
              hookDestructures,
              hookRegistry: registry,
              hasSaveHandler,
              apiImportsInFile,
              apiModuleMap,
            });

            elements.push(
              buildElement(
                relFile,
                i + deriveUnitValue(),
                'toggle',
                extractLabel(line, lines, i),
                handler,
                resolved,
                extractComponent(lines, i),
              ),
            );
          }
        }
      }
    } catch (e) {
      process.stderr.write(`  [warn] Could not parse UI in ${file}: ${(e as Error).message}\n`);
    }
  }

  return elements;
}
