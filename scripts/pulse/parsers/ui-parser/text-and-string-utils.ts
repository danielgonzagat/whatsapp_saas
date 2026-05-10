import * as path from 'path';
import {
  deriveUnitValue,
  deriveZeroValue,
  deriveHttpStatusFromObservedCatalog,
} from '../../../dynamic-reality-kernel/catalog-arithmetic';

function isApiModuleSpecifier(value: string): boolean {
  const normalized = value.split(path.sep).join('/');
  return normalized.includes('/lib/api') || normalized.startsWith('@/lib/api');
}

function isTestOrSpecFile(filePath: string): boolean {
  const baseName = path.basename(filePath);
  const segments = baseName.split('.');
  return segments.includes('test') || segments.includes('spec');
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

function extractLabel(line: string, lines: string[], idx: number): string {
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

  for (
    let j = deriveUnitValue();
    j <= deriveUnitValue() + deriveUnitValue() + deriveUnitValue() && idx + j < lines.length;
    j++
  ) {
    const nextLine = lines[idx + j].trim();
    if (looksLikeStyleProperty(nextLine)) {
      continue;
    }
    if (nextLine.startsWith('...')) {
      continue;
    }
    const nextText = readLeadingText(nextLine, 60);
    if (
      nextText &&
      !nextText.includes('=') &&
      !nextText.includes('{') &&
      !nextText.startsWith('//')
    ) {
      return nextText.trim();
    }
    const insideTag = extractBetween(nextLine, '>', '<');
    if (insideTag && insideTag.length <= 60) {
      return insideTag.trim();
    }
  }

  return '(sem texto)';
}

function extractComponent(lines: string[], idx: number): string | null {
  for (
    let i = idx;
    i >= Math.max(deriveZeroValue(), idx - deriveHttpStatusFromObservedCatalog('OK'));
    i--
  ) {
    const componentName = readComponentDeclarationName(lines[i]);
    if (componentName && startsWithUppercase(componentName)) {
      return componentName;
    }
  }
  return null;
}

export {
  isApiModuleSpecifier,
  isTestOrSpecFile,
  extractBetween,
  extractQuotedAttribute,
  looksLikeStyleProperty,
  readLeadingText,
  readLeadingIdentifier,
  readComponentDeclarationName,
  stripIdentifierToken,
  startsWithUppercase,
  splitWhitespaceTokens,
  extractLabel,
  extractComponent,
};
