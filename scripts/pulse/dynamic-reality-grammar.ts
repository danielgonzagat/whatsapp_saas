import * as path from 'path';

const HTTP_METHOD_ORDER = ['get', 'post', 'put', 'patch', 'delete'] as const;
const BODY_METHOD_HINTS = new Set([
  'post',
  'put',
  'patch',
  'create',
  'update',
  'replace',
  'submit',
  'upload',
]);
const DESTRUCTIVE_METHOD_HINTS = new Set(['delete', 'remove', 'destroy']);
const READ_ONLY_METHOD_HINTS = new Set([
  'get',
  'head',
  'options',
  'read',
  'list',
  'find',
  'search',
]);

export function normalizeObservedHttpMethod(value: string): string {
  return value.trim().toLowerCase();
}

export function isObservedReadOnlyMethod(method: string): boolean {
  const normalized = normalizeObservedHttpMethod(method);
  return READ_ONLY_METHOD_HINTS.has(normalized);
}

export function isObservedDestructiveMethod(method: string): boolean {
  const normalized = normalizeObservedHttpMethod(method);
  return DESTRUCTIVE_METHOD_HINTS.has(normalized);
}

export function isObservedMutatingMethod(method: string): boolean {
  const normalized = normalizeObservedHttpMethod(method);
  return (
    isObservedDestructiveMethod(normalized) ||
    BODY_METHOD_HINTS.has(normalized) ||
    (!isObservedReadOnlyMethod(normalized) && normalized.length > 0)
  );
}

export function isObservedHttpEntrypointMethod(method: string): boolean {
  const normalized = normalizeObservedHttpMethod(method);
  return (
    READ_ONLY_METHOD_HINTS.has(normalized) ||
    BODY_METHOD_HINTS.has(normalized) ||
    DESTRUCTIVE_METHOD_HINTS.has(normalized)
  );
}

export function observedMethodAcceptsBody(method: string, hasSchema: boolean): boolean {
  return hasSchema || BODY_METHOD_HINTS.has(normalizeObservedHttpMethod(method));
}

export function toPlaywrightHttpMethod(method: string): string {
  const normalized = normalizeObservedHttpMethod(method);
  if (HTTP_METHOD_ORDER.some((candidate) => candidate === normalized)) {
    return normalized;
  }
  return isObservedMutatingMethod(normalized) ? 'post' : 'get';
}

export function inferActionKindFromObservedMethod(
  method: string,
): 'create' | 'update' | 'delete' | 'read' {
  const normalized = normalizeObservedHttpMethod(method);
  if (isObservedDestructiveMethod(normalized)) {
    return 'delete';
  }
  if (normalized === 'put' || normalized === 'patch' || normalized.includes('update')) {
    return 'update';
  }
  if (isObservedMutatingMethod(normalized)) {
    return 'create';
  }
  return 'read';
}

export function extractRouteFromSurfaceId(surfaceId: string): string {
  const trimmed = surfaceId.trim();
  if (!trimmed) {
    return '/';
  }
  if (trimmed.startsWith('/')) {
    return trimmed;
  }
  const parts = trimmed
    .split('')
    .map((char) => (char === ':' || char === '/' ? ' ' : char))
    .join('')
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !part.includes('surface'));
  const route = normalizeRouteCharacters(parts.join('/'));
  return route ? `/${route}` : '/';
}

function normalizeRouteCharacters(value: string): string {
  const output: string[] = [];
  let previousCategory: 'separator' | 'lowerOrDigit' | 'upper' | 'other' = 'separator';

  for (const char of value) {
    const isUpper = char >= 'A' && char <= 'Z';
    const isLower = char >= 'a' && char <= 'z';
    const isDigit = char >= '0' && char <= '9';
    const isPathSeparator = char === '/';
    const isWordSeparator = char === '_' || char === '-';
    const nextCategory = isUpper ? 'upper' : isLower || isDigit ? 'lowerOrDigit' : 'other';

    if (
      isUpper &&
      previousCategory === 'lowerOrDigit' &&
      output.length > 0 &&
      output[output.length - 1] !== '-' &&
      output[output.length - 1] !== '/'
    ) {
      output.push('-');
    }

    if (isLower || isDigit || isUpper) {
      output.push(char.toLowerCase());
      previousCategory = nextCategory;
      continue;
    }

    if (isPathSeparator) {
      if (output.length > 0 && output[output.length - 1] !== '/') {
        output.push('/');
      }
      previousCategory = 'separator';
      continue;
    }

    if (isWordSeparator || output.length > 0) {
      if (
        output.length > 0 &&
        output[output.length - 1] !== '-' &&
        output[output.length - 1] !== '/'
      ) {
        output.push('-');
      }
      previousCategory = 'separator';
    }
  }

  while (output[0] === '-' || output[0] === '/') {
    output.shift();
  }
  while (output[output.length - 1] === '-' || output[output.length - 1] === '/') {
    output.pop();
  }

  return output.join('');
}

export function looksLikeLocalFileReference(token: string): boolean {
  const normalized = stripCommandTokenPunctuation(token.trim());
  if (!normalized || path.isAbsolute(normalized) || hasProtocolPrefix(normalized)) {
    return false;
  }
  if (normalized.includes('node_modules/')) {
    return false;
  }
  const extension = path.extname(normalized);
  return extension.length > 1 && extension.slice(1).split('').every(isAlphaNumeric);
}

export function extractLocalFileReferences(command: string): string[] {
  return [
    ...new Set(
      splitOnWhitespace(command)
        .map(stripRelativeDotSlashPrefix)
        .filter(looksLikeLocalFileReference),
    ),
  ];
}

function stripRelativeDotSlashPrefix(value: string): string {
  let current = value;
  while (current.startsWith('./')) {
    current = current.slice(2);
  }
  return current;
}

function stripCommandTokenPunctuation(value: string): string {
  let start = 0;
  let end = value.length;
  while (start < end && isQuote(value[start])) {
    start++;
  }
  while (end > start && (isQuote(value[end - 1]) || value[end - 1] === ',')) {
    end--;
  }
  return value.slice(start, end);
}

function hasProtocolPrefix(value: string): boolean {
  const colonIndex = value.indexOf(':');
  if (colonIndex <= 0) {
    return false;
  }
  return value.slice(0, colonIndex).split('').every(isAsciiLetter);
}

function splitOnWhitespace(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  for (const char of value) {
    if (char.trim() === '') {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function isQuote(char: string): boolean {
  return char === "'" || char === '"' || char === '`';
}

function isAlphaNumeric(char: string): boolean {
  return isAsciiLetter(char) || (char >= '0' && char <= '9');
}

function isAsciiLetter(char: string): boolean {
  const lower = char.toLowerCase();
  return lower >= 'a' && lower <= 'z';
}
