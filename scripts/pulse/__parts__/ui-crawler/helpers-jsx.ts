import type { UIElementKind } from '../../types.ui-crawler';
import { DOM_ELEMENTS, SHADCN_ELEMENTS } from './constants';

export function isWhitespaceChar(c: string | undefined): boolean {
  if (!c) return false;
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f' || c === '\v';
}

export function isIdentifierChar(c: string | undefined): boolean {
  return Boolean(c && /[\w$]/.test(c));
}

export function hasIdentifierAt(text: string, offset: number, identifier: string): boolean {
  if (!text.startsWith(identifier, offset)) return false;
  return !isIdentifierChar(text[offset - 1]) && !isIdentifierChar(text[offset + identifier.length]);
}

/** Extract the handler expression from a JSX prop assignment like `onClick={handler}`. */
export function extractJSXHandler(line: string, eventName: string): string | null {
  let searchFrom = 0;
  while (searchFrom < line.length) {
    const eventIndex = line.indexOf(eventName, searchFrom);
    if (eventIndex < 0) return null;

    let cursor = eventIndex + eventName.length;
    while (isWhitespaceChar(line[cursor])) cursor++;
    if (line[cursor] !== '=') {
      searchFrom = cursor;
      continue;
    }

    cursor++;
    while (isWhitespaceChar(line[cursor])) cursor++;
    if (line[cursor] !== '{') {
      searchFrom = cursor;
      continue;
    }

    const start = cursor + 1;
    let depth = 1;
    let i = start;

    while (i < line.length && depth > 0) {
      const ch = line[i];
      if (ch === '"' || ch === "'" || ch === '`') {
        const quote = ch;
        i++;
        while (i < line.length && line[i] !== quote) {
          if (line[i] === '\\') i++;
          i++;
        }
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) return line.substring(start, i).trim();
      }
      i++;
    }

    if (depth > 0 && start < line.length) {
      return line.substring(start).trim();
    }
    searchFrom = start;
  }
  return null;
}

/** Extract a visible label from a JSX line. */
export function extractLabel(line: string, lines: string[], idx: number): string {
  const textMatch = line.match(/>([^<]{1,80})</);
  if (textMatch) return textMatch[1].trim();

  const labelMatch = line.match(/label\s*=\s*["'`]([^"'`]{1,80})["'`]/);
  if (labelMatch) return labelMatch[1];

  const ariaMatch = line.match(/aria-label\s*=\s*["'`]([^"'`]{1,80})["'`]/);
  if (ariaMatch) return ariaMatch[1];

  const titleMatch = line.match(/title\s*=\s*["'`]([^"'`]{1,80})["'`]/);
  if (titleMatch) return titleMatch[1];

  const placeholderMatch = line.match(/placeholder\s*=\s*["'`]([^"'`]{1,80})["'`]/);
  if (placeholderMatch) return placeholderMatch[1];

  for (let j = 1; j <= 3 && idx + j < lines.length; j++) {
    const nextLine = lines[idx + j].trim();
    if (
      /^(?:background|display|width|height|position|border|color|font|padding|margin|flex|align|justify|cursor|opacity|transform|transition|overflow|gap|aspect|grid|z-index|top|left|right|bottom)\s*[:=]/i.test(
        nextLine,
      )
    )
      continue;
    if (/^\.\.\.\w+/.test(nextLine)) continue;

    const nextText = nextLine.match(/^([^<{>\s][^<]{1,80})/);
    if (
      nextText &&
      !nextText[1].includes('=') &&
      !nextText[1].includes('{') &&
      !nextText[1].startsWith('//')
    )
      return nextText[1].trim();

    const insideTag = nextLine.match(/>([^<]{1,80})</);
    if (insideTag) return insideTag[1].trim();
  }

  return '(no label)';
}

/** Check if a JSX element has a `disabled` attribute. */
export function isDisabled(line: string): boolean {
  return /\bdisabled\b/.test(line);
}

/** Determine element kind from a JSX line. */
export function detectElementKind(line: string): UIElementKind | null {
  for (const [tag, kind] of Object.entries(DOM_ELEMENTS)) {
    const re = new RegExp(`<${tag}\\b`, 'i');
    if (re.test(line)) return kind;
  }
  for (const [tag, kind] of Object.entries(SHADCN_ELEMENTS)) {
    const re = new RegExp(`<${tag}\\b`);
    if (re.test(line)) return kind;
  }
  return null;
}

/** Extract href from a link element. */
export function extractHref(line: string): string | null {
  const match = line.match(/href\s*=\s*["'`]([^"'`]+)["'`]/);
  return match ? match[1] : null;
}

/** Extract the action URL from a form element. */
export function extractFormAction(line: string): string | null {
  const match = line.match(/action\s*=\s*["'`]([^"'`]+)["'`]/);
  return match ? match[1] : null;
}

/** Build a CSS selector-like string for an element. */
export function buildSelector(
  kind: UIElementKind,
  label: string,
  handlerName: string | null,
  idx: number,
): string {
  if (handlerName) return `${kind}[data-handler="${handlerName}"]`;
  if (label && label !== '(no label)') return `${kind}[aria-label="${label}"]`;
  return `${kind}:nth-of-type(${idx + 1})`;
}
