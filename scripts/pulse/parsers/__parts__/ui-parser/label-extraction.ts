import {
  extractBetween,
  extractQuotedAttribute,
  looksLikeStyleProperty,
  readLeadingText,
} from './component-utils';

export function extractLabel(line: string, lines: string[], idx: number): string {
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

  for (let j = 1; j <= 3 && idx + j < lines.length; j++) {
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
