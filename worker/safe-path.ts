import path from 'node:path';

/** Path.join wrapper — validates segments. */
export function safeJoin(...parts: string[]): string {
  for (const part of parts) {
    if (typeof part !== 'string') {
      throw new TypeError('safeJoin: non-string segment');
    }
    if (part.includes('\0')) {
      throw new Error('safeJoin: null byte');
    }
  }
  return path.join(...parts);
}

/** Companion to safeJoin. */
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
