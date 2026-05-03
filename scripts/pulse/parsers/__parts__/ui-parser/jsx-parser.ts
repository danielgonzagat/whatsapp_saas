export const DOM_HANDLER_PROPS = new Set([
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

export function findJSXHandlerStart(line: string, eventName: string): number {
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

/**
 * Extract a JSX handler expression using brace-counting.
 */
export function extractJSXHandler(line: string, eventName: string): string | null {
  const start = findJSXHandlerStart(line, eventName);
  if (start < 0) {
    return null;
  }

  let depth = 1;
  let i = start;

  while (i < line.length && depth > 0) {
    const ch = line[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      const quote = ch;
      i++;
      while (i < line.length && line[i] !== quote) {
        if (line[i] === '\\') {
          i++;
        }
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

  if (depth > 0 && start < line.length) {
    return line.substring(start).trim();
  }

  return null;
}

export function expandInlineHandler(handler: string, lines: string[], idx: number): string {
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
