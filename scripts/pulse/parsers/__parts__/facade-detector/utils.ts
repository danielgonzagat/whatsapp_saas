import * as path from 'path';

export function compactCode(value: string): string {
  return [...value].filter((char) => char.trim().length > 0).join('');
}

export function lower(value: string): string {
  return value.toLowerCase();
}

export function includesAny(value: string, tokens: readonly string[]): boolean {
  const normalized = lower(value);
  return tokens.some((token) => normalized.includes(lower(token)));
}

export function startsWithAny(value: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

export function hasCommentMarker(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
}

export function isSkippedSourcePath(file: string): boolean {
  const normalized = file.replaceAll('\\', '/').toLowerCase();
  const base = path.basename(normalized);
  return (
    base.endsWith('.test.ts') ||
    base.endsWith('.test.tsx') ||
    base.endsWith('.spec.ts') ||
    base.endsWith('.spec.tsx') ||
    base.endsWith('.d.ts') ||
    normalized.includes('seed') ||
    normalized.includes('migration') ||
    normalized.includes('fixture') ||
    normalized.includes('mock.')
  );
}
