import * as ts from 'typescript';
import type { UIElement } from '../../types.core';
import { isApiModuleSpecifier } from './text-and-string-utils';
import { extractJSXHandler, buildHandlerEvidence } from './handler-utils';

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

function isIdentifierPart(char: string | undefined): boolean {
  if (!char) {
    return false;
  }
  const lower = char.toLowerCase();
  return (lower >= 'a' && lower <= 'z') || (char >= '0' && char <= '9') || char === '_';
}

function extractActionPropNames(line: string): string[] {
  const props: string[] = [];
  let cursor = 0;
  while (cursor < line.length) {
    const onIndex = line.indexOf('on', cursor);
    if (onIndex < 0) {
      break;
    }
    if (isIdentifierPart(line[onIndex - 1])) {
      cursor = onIndex + 2;
      continue;
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

export {
  extractApiImports,
  readJsxTagName,
  hasButtonSemantics,
  extractActionPropNames,
  hasToggleSemantics,
  resolveToggleHandler,
  buildElement,
};
