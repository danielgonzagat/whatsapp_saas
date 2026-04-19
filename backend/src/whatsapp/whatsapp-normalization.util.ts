const S_RE = /\s+/g;
function isDigit(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 48 && code <= 57;
}

export function collapseWhitespace(value: unknown): string {
  return (
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : ''
  )
    .replace(S_RE, ' ')
    .trim();
}

export function extractAsciiDigits(value: unknown): string {
  const input =
    typeof value === 'string'
      ? value
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value)
        : '';
  let result = '';

  for (const char of input) {
    if (isDigit(char)) {
      result += char;
    }
  }

  return result;
}

export function extractPhoneFromChatId(value: unknown): string {
  const input =
    typeof value === 'string'
      ? value.trim()
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value).trim()
        : '';
  const atIndex = input.indexOf('@');
  const core = atIndex >= 0 ? input.slice(0, atIndex) : input;
  return extractAsciiDigits(core);
}

function looksLikePhoneDoePlaceholder(value: string): boolean {
  const parts = collapseWhitespace(value).split(' ');
  if (parts.length < 2) {
    return false;
  }

  const last = parts[parts.length - 1].toLowerCase();
  if (last !== 'doe') {
    return false;
  }

  const prefix = parts.slice(0, -1).join('');
  if (!prefix) {
    return false;
  }

  for (const char of prefix) {
    if (char === '+' || char === '-' || char === '(' || char === ')' || char === ' ') {
      continue;
    }
    if (!isDigit(char)) {
      return false;
    }
  }

  return extractAsciiDigits(prefix).length > 0;
}

function trimTrailingPunctuation(value: string): string {
  let end = value.length;
  while (end > 0) {
    const char = value[end - 1];
    if (
      char === '?' ||
      char === '!' ||
      char === '.' ||
      char === ',' ||
      char === ';' ||
      char === ':'
    ) {
      end -= 1;
      continue;
    }
    break;
  }
  return value.slice(0, end).trim();
}

export function isPlaceholderContactName(value: unknown, phone?: string | null): boolean {
  const normalized = collapseWhitespace(value);
  if (!normalized) {
    return true;
  }

  const lowered = normalized.toLowerCase();
  const phoneDigits = extractAsciiDigits(phone);

  if (lowered === 'doe' || lowered === 'unknown' || lowered === 'desconhecido') {
    return true;
  }

  if (looksLikePhoneDoePlaceholder(normalized)) {
    return true;
  }

  if (phoneDigits && lowered === `${phoneDigits} doe`) {
    return true;
  }

  if (phoneDigits && extractAsciiDigits(normalized) === phoneDigits) {
    return true;
  }

  return false;
}

export function extractFallbackTopic(message: string, maxWords = 8, maxExplicitWords = 6) {
  const normalized = collapseWhitespace(message);
  if (!normalized) {
    return null;
  }

  const words = normalized.split(' ');
  const pivotIndex = words.findIndex((word) => {
    const lowered = trimTrailingPunctuation(word).toLowerCase();
    return (
      lowered === 'sobre' ||
      lowered === 'do' ||
      lowered === 'da' ||
      lowered === 'de' ||
      lowered === 'para'
    );
  });

  const candidateWords =
    pivotIndex >= 0 && pivotIndex < words.length - 1
      ? words.slice(pivotIndex + 1, pivotIndex + 1 + maxExplicitWords)
      : words.slice(0, maxWords);

  const compact = trimTrailingPunctuation(candidateWords.join(' ').trim());
  return compact || null;
}

export function normalizeIntentText(message: string): string {
  const normalized = collapseWhitespace(message).toLowerCase().normalize('NFD');
  let result = '';

  for (const char of normalized) {
    const code = char.charCodeAt(0);
    if (code >= 0x0300 && code <= 0x036f) {
      continue;
    }
    result += char;
  }

  return result;
}

export function includesAnyPhrase(haystack: string, phrases: readonly string[]): boolean {
  return phrases.some((phrase) => haystack.includes(phrase));
}
