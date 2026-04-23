import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

function isTestFile(filePath: string): boolean {
  return /\.(spec|test)\.(ts|tsx)$|__tests__|__mocks__|fixture/i.test(filePath);
}

// Whether the line is inside a string literal or a comment (very rough heuristic)
function isInStringOrComment(line: string, matchIndex: number): boolean {
  // Check for // comment before match
  const commentIdx = line.indexOf('//');
  if (commentIdx !== -1 && commentIdx < matchIndex) {
    return true;
  }

  // Check for obvious string context: the match is between quotes
  let inStr: string | null = null;
  for (let i = 0; i < matchIndex; i++) {
    const ch = line[i];
    if (inStr) {
      if (ch === inStr && (i === 0 || line[i - 1] !== '\\')) {
        inStr = null;
      }
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
    }
  }
  return inStr !== null;
}

/**
 * Check whether any of the preceding lines within the enclosing function scope
 * (up to 30 lines), or the current line itself, suggest the window/document
 * access is guarded against SSR.
 */
function hasGuardAbove(lines: string[], idx: number, lookback = 30): boolean {
  // Check same line first (inline guard: typeof window !== 'undefined' && window.x)
  const currentLine = lines[idx] || '';
  if (hasDefinedGuard(currentLine, 'window')) {
    return true;
  }
  if (hasDefinedGuard(currentLine, 'document')) {
    return true;
  }
  if (currentLine.includes('isBrowser')) {
    return true;
  }

  for (let j = Math.max(0, idx - lookback); j < idx; j++) {
    if (hasDefinedGuard(lines[j], 'window')) {
      return true;
    }
    if (hasDefinedGuard(lines[j], 'document')) {
      return true;
    }
    // Also catch `if (typeof window === 'undefined') return` early-exit guards
    if (hasUndefinedEarlyExit(lines[j], 'window')) {
      return true;
    }
    if (hasUndefinedEarlyExit(lines[j], 'document')) {
      return true;
    }
    if (lines[j].includes('useEffect(')) {
      return true;
    }
    if (lines[j].includes('isBrowser')) {
      return true;
    }
  }
  return false;
}

function hasDefinedGuard(line: string, globalName: 'document' | 'window'): boolean {
  return (
    line.includes(`typeof ${globalName} !== 'undefined'`) ||
    line.includes(`typeof ${globalName} !== "undefined"`) ||
    line.includes(`typeof ${globalName} !== \`undefined\``)
  );
}

function hasUndefinedEarlyExit(line: string, globalName: 'document' | 'window'): boolean {
  return (
    line.includes(`typeof ${globalName} === 'undefined'`) ||
    line.includes(`typeof ${globalName} === "undefined"`) ||
    line.includes(`typeof ${globalName} === \`undefined\``)
  );
}

/** Returns true if this line is deeply indented (inside a function/block body). */
function isDeepIndent(line: string): boolean {
  const spaces = line.match(/^(\s*)/)?.[1].length ?? 0;
  // "module scope" is usually 0 or 2 spaces. Anything >= 4 is inside a block.
  return spaces >= 4;
}

/** Check next js patterns. */
export function checkNextJSPatterns(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  // ---- <img> instead of Next.js <Image> ----
  const tsxFiles = walkFiles(config.frontendDir, ['.tsx']).filter((f) => !isTestFile(f));

  for (const file of tsxFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // Skip comment lines
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      // Find <img (not <Image, not <imgSomething)
      const imgRe = /<img\s/g;
      let m: RegExpExecArray | null;
      while ((m = imgRe.exec(line)) !== null) {
        // Skip if it's inside a string or comment
        if (isInStringOrComment(line, m.index)) {
          continue;
        }

        breaks.push({
          type: 'NEXTJS_NO_IMAGE_COMPONENT',
          severity: 'medium',
          file: relFile,
          line: i + 1,
          description: '`<img>` used instead of Next.js `<Image>` — missing optimization',
          detail: trimmed.slice(0, 120),
        });
      }
    }
  }

  // ---- SSR-unsafe window/document access at module scope ----
  // Only flag very conservative cases: module-scope lines (low indentation),
  // not inside a useEffect, not guarded by typeof window !== 'undefined'
  const allFrontendFiles = [
    ...walkFiles(config.frontendDir, ['.tsx']),
    ...walkFiles(config.frontendDir, ['.ts']),
  ].filter((f) => {
    if (isTestFile(f)) {
      return false;
    }
    // Skip app/api routes (they run server-side on purpose)
    if (f.includes('/app/api/')) {
      return false;
    }
    return true;
  });

  const WIN_DOC_RE = /\b(window|document)\./g;

  for (const file of allFrontendFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
        continue;
      }

      WIN_DOC_RE.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = WIN_DOC_RE.exec(line)) !== null) {
        if (isInStringOrComment(line, m.index)) {
          continue;
        }

        // Only flag if NOT deeply indented (i.e., at module scope or in a shallow function)
        if (isDeepIndent(line)) {
          continue;
        }

        // Skip if guarded by typeof check or useEffect in the preceding lines
        if (hasGuardAbove(lines, i)) {
          continue;
        }

        breaks.push({
          type: 'SSR_UNSAFE_ACCESS',
          severity: 'high',
          file: relFile,
          line: i + 1,
          description: `\`${m[1]}\` accessed at module scope — crashes during SSR`,
          detail: trimmed.slice(0, 120),
        });
        break; // One break per line is enough
      }
    }
  }

  // ---- @UploadedFile() without validation ----
  const controllerFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => f.endsWith('.controller.ts') && !isTestFile(f),
  );

  for (const file of controllerFiles) {
    let content: string;
    try {
      content = readTextFile(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    const relFile = path.relative(config.rootDir, file);

    // Find each method that uses @UploadedFile()
    for (let i = 0; i < lines.length; i++) {
      if (!/@UploadedFile\(\)/.test(lines[i])) {
        continue;
      }

      // Scan a window of ±20 lines for validation
      const start = Math.max(0, i - 20);
      const end = Math.min(lines.length, i + 20);
      const methodContext = lines.slice(start, end).join('\n');

      const hasValidation =
        /ParseFilePipe/.test(methodContext) ||
        /MaxFileSizeValidator/.test(methodContext) ||
        /FileTypeValidator/.test(methodContext);

      if (!hasValidation) {
        breaks.push({
          type: 'UPLOAD_NO_VALIDATION',
          severity: 'high',
          file: relFile,
          line: i + 1,
          description:
            '@UploadedFile() used without ParseFilePipe/MaxFileSizeValidator/FileTypeValidator',
          detail: lines[i].trim().slice(0, 120),
        });
      }
    }
  }

  return breaks;
}
