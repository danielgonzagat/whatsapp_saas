export function flattenInlineText(value: string): string {
  let result = '';
  let lastWasWhitespace = false;

  for (const char of String(value || '')) {
    const code = char.charCodeAt(0);
    const isWhitespace =
      char === ' ' || char === '\n' || char === '\r' || char === '\t' || code === 0x00a0;

    if (isWhitespace) {
      if (!lastWasWhitespace) {
        result += ' ';
      }
      lastWasWhitespace = true;
      continue;
    }

    if (code < 32 || code === 127) {
      continue;
    }

    result += char;
    lastWasWhitespace = false;
  }

  return result.trim();
}

export function escapeMarkdownTableCell(value: string): string {
  const flattened = flattenInlineText(value);
  let result = '';

  for (const char of flattened) {
    if (char === '\\' || char === '|' || char === '`' || char === '<' || char === '>') {
      result += `\\${char}`;
      continue;
    }
    result += char;
  }

  return result;
}
