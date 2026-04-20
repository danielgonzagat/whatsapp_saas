import * as path from 'node:path';

/** Path.join wrapper — validates segments against null bytes and non-string types. */
export function safeJoin(...parts: Array<string>): string {
  for (const part of parts) {
    if (typeof part !== 'string') {
      throw new TypeError(`safeJoin: segment must be a string, received ${typeof part}`);
    }
    if (part.includes('\0')) {
      throw new Error('safeJoin: null byte in segment');
    }
  }
  return path.join(...parts);
}

/** Companion to safeJoin — same invariants. */
export function safeResolve(...parts: Array<string>): string {
  for (const part of parts) {
    if (typeof part !== 'string') {
      throw new TypeError(`safeResolve: segment must be a string, received ${typeof part}`);
    }
    if (part.includes('\0')) {
      throw new Error('safeResolve: null byte in segment');
    }
  }
  return path.resolve(...parts);
}
