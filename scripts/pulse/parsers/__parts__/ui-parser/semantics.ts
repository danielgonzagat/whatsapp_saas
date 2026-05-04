import * as path from 'path';
import * as ts from 'typescript';
import { extractJSXHandler } from './jsx-parser';

export function extractApiImports(fileContent: string): Set<string> {
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

export function isApiModuleSpecifier(value: string): boolean {
  const normalized = value.split(path.sep).join('/');
  return normalized.includes('/lib/api') || normalized.startsWith('@/lib/api');
}

export function isTestOrSpecFile(filePath: string): boolean {
  const baseName = path.basename(filePath);
  const segments = baseName.split('.');
  return segments.includes('test') || segments.includes('spec');
}

export function readJsxTagName(line: string): string | null {
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

export function hasButtonSemantics(line: string): boolean {
  const tagName = readJsxTagName(line);
  if (!tagName) {
    return false;
  }
  const lowerTag = tagName.toLowerCase();
  return lowerTag === 'button' || lowerTag.endsWith('button') || lowerTag.endsWith('bt');
}

export function extractActionPropNames(line: string): string[] {
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

export function hasToggleSemantics(line: string): boolean {
  const tagName = readJsxTagName(line);
  if (!tagName) {
    return false;
  }
  const lowerTag = tagName.toLowerCase();
  return lowerTag.includes('toggle') || lowerTag.includes('switch') || lowerTag.endsWith('tg');
}

export function resolveToggleHandler(line: string): string | null {
  return extractJSXHandler(line, 'onChange') || extractJSXHandler(line, 'onClick');
}
