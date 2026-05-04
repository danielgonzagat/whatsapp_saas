export function extractBetween(line: string, open: string, close: string): string | null {
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

export function extractQuotedAttribute(line: string, attrName: string): string | null {
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

export function looksLikeStyleProperty(line: string): boolean {
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

export function readLeadingText(line: string, max: number): string | null {
  if (!line || line[0] === '<' || line[0] === '{' || line[0] === '>' || line[0].trim() === '') {
    return null;
  }
  const boundary = line.indexOf('<');
  const text = line.slice(0, boundary < 0 ? Math.min(line.length, max) : Math.min(boundary, max));
  return text.trim() ? text : null;
}

export function readLeadingIdentifier(line: string): string {
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

export function startsWithUppercase(value: string): boolean {
  return value.length > 0 && value[0] >= 'A' && value[0] <= 'Z';
}

export function splitWhitespaceTokens(value: string): string[] {
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

export function readComponentDeclarationName(line: string): string | null {
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

export function extractComponent(lines: string[], idx: number): string | null {
  for (let i = idx; i >= Math.max(0, idx - 200); i--) {
    const componentName = readComponentDeclarationName(lines[i]);
    if (componentName && startsWithUppercase(componentName)) {
      return componentName;
    }
  }
  return null;
}
