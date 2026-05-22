import path from 'node:path';

/** Path.resolve wrapper — validates segments. */
export function safeResolve(...parts: string[]): string {
  for (const part of parts) {
    if (typeof part !== 'string') {
      throw new TypeError('safeResolve: non-string segment');
    }
    if (part.includes('\0')) {
      throw new Error('safeResolve: null byte');
    }
  }
  return path.resolve(...parts);
}
