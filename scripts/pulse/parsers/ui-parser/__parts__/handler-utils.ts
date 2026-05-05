import type { UIElement } from '../../../types.core';
import {
  deriveUnitValue,
  deriveZeroValue,
  observeStatusTextLengthFromCatalog,
  deriveHttpStatusFromObservedCatalog,
} from '../../../dynamic-reality-kernel/__parts__/catalog-arithmetic';

function buildHandlerEvidence(
  handler: string | null,
  resolved: { type: UIElement['handlerType']; apiCalls: string[] },
): Pick<UIElement, 'handlerEvidence' | 'handlerPredicates'> {
  const evidence = new Set<string>();
  const predicates = new Set<string>();
  if (!handler || handler.trim().length === deriveZeroValue()) {
    predicates.add('handler:missing');
  } else {
    predicates.add('handler:present');
  }
  predicates.add(`handler:${resolved.type}`);
  if (resolved.apiCalls.length > deriveZeroValue()) {
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

  let depth = deriveUnitValue();
  let i = start;

  while (i < line.length && depth > deriveZeroValue()) {
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
      if (depth === deriveZeroValue()) {
        return line.substring(start, i).trim();
      }
    }
    i++;
  }

  if (depth > deriveZeroValue() && start < line.length) {
    return line.substring(start).trim();
  }

  return null;
}

function expandInlineHandler(handler: string, lines: string[], idx: number): string {
  if (handler.trimEnd().endsWith('=>')) {
    const expanded = [handler];
    for (
      let j = idx + deriveUnitValue();
      j <
      Math.min(
        idx +
          observeStatusTextLengthFromCatalog(
            deriveHttpStatusFromObservedCatalog('Payment Required'),
          ) +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue() +
          deriveUnitValue(),
        lines.length,
      );
      j++
    ) {
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
  for (const ch of handler) {
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

  const expanded = [handler];
  for (
    let j = idx + deriveUnitValue();
    j <
    Math.min(
      idx +
        observeStatusTextLengthFromCatalog(
          deriveHttpStatusFromObservedCatalog('Payment Required'),
        ) +
        observeStatusTextLengthFromCatalog(deriveHttpStatusFromObservedCatalog('Forbidden')) +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue() +
        deriveUnitValue(),
      lines.length,
    );
    j++
  ) {
    expanded.push(lines[j]);
    for (const ch of lines[j]) {
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
  const trimmed = line.trimStart();
  if (!trimmed.startsWith('}')) {
    return false;
  }
  const afterBlock = trimmed.slice(deriveUnitValue()).trimStart();
  return (
    afterBlock.length === deriveZeroValue() ||
    afterBlock.startsWith(')') ||
    afterBlock.startsWith(',')
  );
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

export {
  buildHandlerEvidence,
  findJSXHandlerStart,
  extractJSXHandler,
  expandInlineHandler,
  isClosingBlockLine,
  DOM_HANDLER_PROPS,
};
