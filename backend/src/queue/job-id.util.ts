function sanitizeQueueIdPart(value: unknown): string {
  const input =
    typeof value === 'string'
      ? value.trim()
      : typeof value === 'number' || typeof value === 'boolean'
        ? String(value).trim()
        : '';
  let normalized = '';
  let previousWasSeparator = false;

  for (const char of input) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isUpper = code >= 65 && code <= 90;
    const isLower = code >= 97 && code <= 122;
    const isAllowed = isDigit || isUpper || isLower || char === '_' || char === '-';

    if (isAllowed) {
      normalized += char;
      previousWasSeparator = false;
      if (normalized.length >= 80) {
        break;
      }
      continue;
    }

    if (!previousWasSeparator && normalized.length > 0) {
      normalized += '_';
      previousWasSeparator = true;
      if (normalized.length >= 80) {
        break;
      }
    }
  }

  while (normalized.startsWith('_')) {
    normalized = normalized.slice(1);
  }
  while (normalized.endsWith('_')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized || 'na';
}

export function buildQueueJobId(prefix: string, ...parts: unknown[]): string {
  return [sanitizeQueueIdPart(prefix), ...parts.map(sanitizeQueueIdPart)].join('__');
}

export function buildQueueDedupId(prefix: string, ...parts: unknown[]): string {
  return buildQueueJobId(prefix, ...parts);
}
